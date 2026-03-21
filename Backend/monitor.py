"""
monitor.py  –  Sahaay Monitor v3.1
"""
import asyncio, json, uuid, logging
from datetime import datetime, timedelta

from sqlalchemy import select, delete, func, desc
from database.db import get_db
from database.models import RiskSnapshot, Alert as AlertModel
from weather import get_weather
from prediction import predict_risk

log    = logging.getLogger("sahaay.monitor")
CITIES = ["Ludhiana", "Chandigarh", "Amritsar", "Jalandhar", "Patiala"]
MAX_SNAPSHOTS_PER_CITY = 200

RISK_EMOJIS = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢"}


async def _check_city(city: str) -> dict | None:
    try:
        # ── 1. Fetch weather (with safe defaults) ─────────
        try:
            weather = await get_weather(city)
        except Exception as we:
            log.warning("Weather failed for %s (%s) — using defaults", city, we)
            weather = {
                "city": city, "temperature": 30, "humidity": 60,
                "wind_speed": 10, "rainfall": 0,
                "description": "unavailable", "icon": "❓",
            }

        # ── 2. Predict risk ───────────────────────────────
        risk = predict_risk(
            temperature=weather.get("temperature", 30),
            rainfall=weather.get("rainfall",    0),
            wind_speed=weather.get("wind_speed", 10),
            humidity=weather.get("humidity",   60),
        )

        snapshot_id = str(uuid.uuid4())
        ts          = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        async with get_db() as session:

            # ── 3. Save snapshot ──────────────────────────
            session.add(RiskSnapshot(
                id=snapshot_id,
                city=city,
                risk_level=risk["risk_level"],
                risk_score=risk["risk_score"],
                timestamp=ts,
                weather=json.dumps(weather),
                reasons=json.dumps(risk.get("reasons", [])),
            ))
            await session.commit()

            # ── 4. Trim old snapshots ─────────────────────
            count = await session.scalar(
                select(func.count()).select_from(RiskSnapshot)
                .where(RiskSnapshot.city == city)
            )
            if count > MAX_SNAPSHOTS_PER_CITY:
                excess  = count - MAX_SNAPSHOTS_PER_CITY
                old_ids = (await session.execute(
                    select(RiskSnapshot.id)
                    .where(RiskSnapshot.city == city)
                    .order_by(RiskSnapshot.timestamp)
                    .limit(excess)
                )).scalars().all()
                await session.execute(
                    delete(RiskSnapshot).where(RiskSnapshot.id.in_(old_ids)))
                await session.commit()

            # ── 5. Auto-alert for HIGH / CRITICAL ─────────
            if risk["risk_level"] in ("HIGH", "CRITICAL"):
                cutoff = (datetime.now() - timedelta(minutes=30)) \
                         .strftime("%Y-%m-%d %H:%M:%S")
                recent = await session.scalar(
                    select(func.count()).select_from(AlertModel).where(
                        AlertModel.zone    == city,
                        AlertModel.auto    == "true",
                        AlertModel.timestamp >= cutoff,
                    )
                )
                if not recent:
                    alert_id = str(uuid.uuid4())
                    alert_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    reasons  = risk.get("reasons", [])
                    reason   = reasons[0].split("—")[0].strip() if reasons else "Risk Detected"
                    message  = f"⚠️ Auto-alert: {', '.join(reasons)}" if reasons \
                               else f"⚠️ {risk['risk_level']} risk detected in {city}"

                    session.add(AlertModel(
                        id=alert_id, zone=city,
                        type=reason,
                        severity=risk["risk_level"].capitalize(),
                        message=message,
                        channels=json.dumps(["App Notification"]),
                        auto="true",
                        timestamp=alert_ts,
                    ))
                    await session.commit()

                    # Broadcast via WebSocket
                    try:
                        from main import ws_manager
                        await ws_manager.broadcast({
                            "type": "new_alert",
                            "alert": {
                                "id": alert_id, "zone": city,
                                "type": reason,
                                "severity": risk["risk_level"].capitalize(),
                                "message": message,
                                "channels": ["App Notification"],
                                "auto": True, "timestamp": alert_ts,
                            },
                        })
                    except Exception as bcast_err:
                        log.debug("WS broadcast skipped: %s", bcast_err)

                    log.warning("🚨 %s alert auto-created for %s", risk["risk_level"], city)

        log.info(
            "✅ %s → %s (score %.1f) | %s",
            city, risk["risk_level"], risk["risk_score"],
            ", ".join(risk.get("reasons", [])),
        )

        return {
            "id":         snapshot_id,
            "city":       city,
            "risk_level": risk["risk_level"],
            "risk_score": risk["risk_score"],
            "timestamp":  ts,
            "weather":    weather,
            "reasons":    risk.get("reasons", []),
            "emoji":      RISK_EMOJIS.get(risk["risk_level"], "⚪"),
        }

    except Exception as exc:
        log.error("❌ Error checking %s: %s", city, exc, exc_info=True)
        return None


async def run_monitor():
    log.info("🛰️  Monitor running — %s", datetime.now().strftime("%H:%M:%S"))
    results = await asyncio.gather(*[_check_city(c) for c in CITIES],
                                   return_exceptions=False)
    ok = sum(1 for r in results if r is not None)
    log.info("🛰️  Monitor done: %d/%d cities updated", ok, len(CITIES))
    return results