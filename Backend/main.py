"""
main.py  –  Sahaay API v3.2
"""
from __future__ import annotations
import asyncio, logging, os, shutil, time, json, uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import (FastAPI, BackgroundTasks, File, HTTPException, Query,
                     UploadFile, WebSocket, WebSocketDisconnect, status)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, desc

from database.contacts_db import add_contact, delete_contact, get_all_contacts, update_contact
from database.db import close_db, connect_db, get_db
from database.models import Alert as AlertModel, RiskSnapshot
from database.sos_db import fetch_all_sos, get_stats, resolve_sos_db, save_sos, update_sos_location
from monitor import run_monitor
from prediction import predict_risk
from prediction_router import prediction_router
from weather import get_weather
from ml.disaster_model import train_all_models as retrain_models

# ── IVR ──────────────────────────────────────────────────
from ivr.ivr_routes  import router as ivr_router
from ivr.ivr_service import start_ivr, stop_ivr

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
log = logging.getLogger("sahaay")

UPLOAD_DIR     = "uploads"
MONITOR_CITIES = ["Ludhiana", "Chandigarh", "Amritsar", "Jalandhar", "Patiala"]
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── TTL Cache ─────────────────────────────────────────────
class TTLCache:
    def __init__(self):
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if not entry: return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]; return None
        return value

    def set(self, key: str, value: Any, ttl: int = 300):
        self._store[key] = (value, time.monotonic() + ttl)

    def invalidate(self, key: str):
        self._store.pop(key, None)

cache = TTLCache()


# ── WebSocket Manager ─────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        log.info("WS connected — total: %d", len(self.active))

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

ws_manager = ConnectionManager()


# ── Lifespan ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()

    # Start IVR (safe — runs in demo mode if phone not connected)
    start_ivr()

    scheduler = AsyncIOScheduler()

    async def safe_monitor():
        try:
            await run_monitor()
        except Exception as e:
            log.error("Monitor failed: %s", e)

    async def safe_retrain():
        try:
            await retrain_models(use_real_data=True)
        except Exception as e:
            log.error("Retrain failed: %s", e)

    scheduler.add_job(safe_monitor, "interval", minutes=10, id="monitor")
    scheduler.add_job(safe_retrain, "interval", hours=24,   id="retrain")
    scheduler.start()

    log.info("▶ Running initial monitor for all cities...")
    await safe_monitor()
    log.info("✅ Initial monitor complete")

    yield

    scheduler.shutdown()
    stop_ivr()
    await close_db()


# ── App ───────────────────────────────────────────────────
app = FastAPI(title="SAHAAY API", version="3.2", lifespan=lifespan)
app.include_router(prediction_router)
app.include_router(ivr_router)          # IVR routes at /ivr/*
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://sahaay-admin.vercel.app",
        "https://sahaay-citizen.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ── Request Models ────────────────────────────────────────
class SOSRequest(BaseModel):
    name:         str = Field(..., min_length=1, max_length=100)
    location:     str = Field(..., min_length=1)
    people_count: int = Field(..., ge=0, le=10_000)
    message:      str = Field("", max_length=500)

class ContactRequest(BaseModel):
    name:         str = Field(..., min_length=1)
    phone:        str = Field(..., pattern=r"^\+?[\d\s\-]{7,20}$")
    zone:         str
    contact_type: str

class AlertRequest(BaseModel):
    zone:     str
    type:     str
    severity: str
    message:  str       = Field(..., min_length=1)
    channels: list[str] = Field(default_factory=list)

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v):
        if v.lower() not in {"low", "medium", "high", "critical"}:
            raise ValueError("severity must be low/medium/high/critical")
        return v.capitalize()

class PhoneSosRequest(BaseModel):
    caller_number: str
    source:        str = "ivr_inbound"
    message:       str = "Emergency reported via phone call"


# ═══════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════

@app.get("/")
def home():
    return {
        "message": "SAHAAY API v3.2 ✅",
        "docs":    "/docs",
        "ws":      "/ws/sos",
        "ivr":     "/ivr/status",
    }

@app.get("/health")
async def health():
    try:
        async with get_db() as session:
            await session.execute(select(1))
            db_ok = True
    except Exception:
        db_ok = False
    from ivr.modem_bridge import modem
    return {
        "status":    "ok" if db_ok else "degraded",
        "database":  "connected" if db_ok else "unreachable",
        "ivr":       "active" if modem._connected else "demo_mode",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── WebSocket ─────────────────────────────────────────────
@app.websocket("/ws/sos")
async def sos_websocket(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        signals = await fetch_all_sos()
        await ws.send_json({"type": "snapshot", "signals": signals})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


# ── Weather ───────────────────────────────────────────────
@app.get("/weather/{city}")
async def weather(city: str):
    key = f"weather:{city.lower()}"
    if cached := cache.get(key):
        return cached
    try:
        data = await get_weather(city)
        cache.set(key, data, ttl=300)
        return data
    except Exception as e:
        log.error("Weather fetch failed for %s: %s", city, e)
        return {
            "city": city, "temperature": 30, "humidity": 60,
            "wind_speed": 10, "rainfall": 0,
            "description": "unavailable", "icon": "❓",
        }


# ── Prediction ────────────────────────────────────────────
@app.get("/predict/{city}")
async def predict(city: str):
    key = f"predict:{city.lower()}"
    if cached := cache.get(key):
        return cached
    w    = await get_weather(city)
    risk = predict_risk(temperature=w["temperature"], rainfall=w["rainfall"],
                        wind_speed=w["wind_speed"],   humidity=w["humidity"])
    result = {"city": city, "weather": w, "risk": risk}
    cache.set(key, result, ttl=300)
    return result


# ── SOS ───────────────────────────────────────────────────
@app.post("/sos", status_code=status.HTTP_201_CREATED)
async def submit_sos(data: SOSRequest):
    import httpx

    async def geocode(place: str):
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                res = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": place + ", India", "format": "json", "limit": 1},
                    headers={"User-Agent": "SAHAAY-DisasterApp/1.0"},
                )
                d = res.json()
                if d:
                    return float(d[0]["lat"]), float(d[0]["lon"])
        except Exception as e:
            log.warning("Geocode failed: %s", e)
        return 0.0, 0.0

    lat, lng = await geocode(data.location)
    signal   = await save_sos(
        name=data.name, location=data.location,
        latitude=lat, longitude=lng,
        people_count=data.people_count, message=data.message,
    )
    await ws_manager.broadcast({"type": "new_sos", "signal": signal})

    # Auto-trigger IVR broadcast on new SOS
    asyncio.create_task(_ivr_sos_broadcast(signal))

    return {"success": True, "sos": signal}


async def _ivr_sos_broadcast(signal: dict):
    """Broadcast IVR call to all contacts when a new SOS is received."""
    try:
        from ivr.ivr_service import broadcast_alert_async
        from database.models import Contact
        async with get_db() as session:
            result   = await session.execute(select(Contact))
            contacts = result.scalars().all()
            numbers  = [c.phone for c in contacts if c.phone]
        if numbers:
            await broadcast_alert_async(
                numbers    = numbers,
                alert_id   = str(signal["id"]),
                alert_type = "sos",
                zone       = signal.get("location", ""),
                risk_level = "HIGH",
            )
    except Exception as e:
        log.error("IVR SOS broadcast failed: %s", e)


@app.get("/sos/all")
async def list_sos():
    signals = await fetch_all_sos()
    return {
        "total":   len(signals),
        "active":  sum(1 for s in signals if s["status"] == "ACTIVE"),
        "signals": signals,
    }

@app.put("/sos/{sos_id}/resolve")
async def resolve(sos_id: str):
    result = await resolve_sos_db(sos_id)
    await ws_manager.broadcast({"type": "resolve_sos", "sos_id": sos_id})
    return result

@app.put("/sos/{sos_id}/location")
async def update_location(sos_id: str,
                          lat: float = Query(..., ge=-90,  le=90),
                          lng: float = Query(..., ge=-180, le=180)):
    return await update_sos_location(sos_id, lat, lng)

@app.post("/sos/{sos_id}/media")
async def upload_media(sos_id: str, files: list[UploadFile] = File(...)):
    saved = []
    for file in files:
        if file.size and file.size > 20 * 1024 * 1024:
            raise HTTPException(413, detail=f"{file.filename} exceeds 20MB")
        safe = file.filename.replace(" ", "_")
        path = f"{UPLOAD_DIR}/{sos_id}_{safe}"
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        saved.append(f"/uploads/{sos_id}_{safe}")
    return {"success": True, "files": saved}


# ── Phone SOS (from IVR inbound call) ────────────────────
@app.post("/sos/phone", status_code=status.HTTP_201_CREATED)
async def create_phone_sos(data: PhoneSosRequest):
    """Creates an SOS when a citizen calls the IVR inbound number."""
    signal = await save_sos(
        name         = f"Caller {data.caller_number}",
        location     = "Via Phone Call — location unknown",
        latitude     = 0.0,
        longitude    = 0.0,
        people_count = 1,
        message      = data.message,
    )
    await ws_manager.broadcast({"type": "new_sos", "signal": signal})
    log.info("📞 Phone SOS created from %s", data.caller_number)
    return {"success": True, "signal": signal}


# ── Alerts ────────────────────────────────────────────────
@app.post("/alerts", status_code=status.HTTP_201_CREATED)
async def create_alert(data: AlertRequest):
    alert_id = str(uuid.uuid4())
    ts       = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    async with get_db() as session:
        session.add(AlertModel(
            id=alert_id, zone=data.zone, type=data.type,
            severity=data.severity, message=data.message,
            channels=json.dumps(data.channels),
            auto="false", timestamp=ts,
        ))
        await session.commit()
    alert = {
        "id": alert_id, "zone": data.zone, "type": data.type,
        "severity": data.severity, "message": data.message,
        "channels": data.channels, "auto": False, "timestamp": ts,
    }
    await ws_manager.broadcast({"type": "new_alert", "alert": alert})
    cache.invalidate("dashboard")

    # Auto-trigger IVR broadcast for HIGH/CRITICAL alerts
    if data.severity.upper() in ("HIGH", "CRITICAL"):
        asyncio.create_task(_ivr_alert_broadcast(alert_id, data.zone, data.severity))

    return {"success": True, "alert": alert}


async def _ivr_alert_broadcast(alert_id: str, zone: str, severity: str):
    """Broadcast IVR call to zone contacts when a HIGH/CRITICAL alert fires."""
    try:
        from ivr.ivr_service import broadcast_alert_async
        from database.models import Contact
        async with get_db() as session:
            result   = await session.execute(
                select(Contact).where(Contact.zone == zone)
            )
            contacts = result.scalars().all()
            numbers  = [c.phone for c in contacts if c.phone]
        if numbers:
            await broadcast_alert_async(
                numbers    = numbers,
                alert_id   = alert_id,
                alert_type = "risk",
                zone       = zone,
                risk_level = severity.upper(),
            )
    except Exception as e:
        log.error("IVR alert broadcast failed: %s", e)


@app.get("/alerts")
async def get_alerts(limit: int = Query(50, ge=1, le=200)):
    async with get_db() as session:
        result = await session.execute(
            select(AlertModel).order_by(desc(AlertModel.timestamp)).limit(limit))
        alerts = []
        for row in result.scalars().all():
            alerts.append({
                "id": row.id, "zone": row.zone, "type": row.type,
                "severity": row.severity, "message": row.message,
                "channels": json.loads(row.channels or "[]"),
                "timestamp": row.timestamp,
            })
        return alerts


# ── Shelters ──────────────────────────────────────────────
@app.get("/shelters")
async def get_shelters(
    lat:    float = Query(30.9010, ge=-90,   le=90),
    lng:    float = Query(75.8573, ge=-180,  le=180),
    radius: int   = Query(10_000,  ge=500,   le=50_000),
):
    key = f"shelters:{lat:.3f}:{lng:.3f}:{radius}"
    if cached := cache.get(key):
        return cached
    query = f"""[out:json][timeout:25];
    (node["amenity"="shelter"](around:{radius},{lat},{lng});
     node["amenity"="community_centre"](around:{radius},{lat},{lng});
     node["emergency"="assembly_point"](around:{radius},{lat},{lng});
     node["building"="school"](around:{radius},{lat},{lng});
     way["building"="school"](around:{radius},{lat},{lng}););
    out center 20;"""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res  = await client.post("https://overpass-api.de/api/interpreter",
                                     data={"data": query})
            data = res.json()
    except Exception as e:
        raise HTTPException(503, detail=f"Shelter lookup failed: {e}")
    shelters = []
    for el in data.get("elements", []):
        slat = el.get("lat") or el.get("center", {}).get("lat")
        slng = el.get("lon") or el.get("center", {}).get("lon")
        tags = el.get("tags", {})
        name = (tags.get("name")
                or tags.get("amenity", "").replace("_", " ").title()
                or "Emergency Shelter")
        if slat and slng:
            shelters.append({
                "name":     name, "lat": slat, "lng": slng,
                "capacity": int(tags.get("capacity", 100)),
                "type":     tags.get("amenity") or tags.get("building") or "shelter",
            })
    cache.set(key, shelters, ttl=1800)
    return shelters


# ── Monitor ───────────────────────────────────────────────
@app.get("/monitor")
async def get_monitor():
    results = []
    async with get_db() as session:
        for city in MONITOR_CITIES:
            result = await session.execute(
                select(RiskSnapshot)
                .where(RiskSnapshot.city == city)
                .order_by(desc(RiskSnapshot.timestamp))
                .limit(1)
            )
            row = result.scalar_one_or_none()
            if row:
                results.append({
                    "id":         row.id,
                    "city":       row.city,
                    "risk_level": row.risk_level,
                    "risk_score": row.risk_score,
                    "timestamp":  row.timestamp,
                    "weather":    json.loads(row.weather  or "{}"),
                    "reasons":    json.loads(row.reasons  or "[]"),
                    "emoji":      _risk_emoji(row.risk_level),
                })
    if not results:
        log.warning("No monitor snapshots in DB — fetching live fallback")
        results = await _live_monitor_fallback()
    return results

@app.get("/monitor/{city}/trend")
async def get_trend(city: str, limit: int = Query(24, ge=1, le=168)):
    async with get_db() as session:
        result = await session.execute(
            select(RiskSnapshot)
            .where(RiskSnapshot.city == city)
            .order_by(desc(RiskSnapshot.timestamp))
            .limit(limit)
        )
        docs = []
        for row in result.scalars().all():
            docs.append({
                "id":         row.id,
                "city":       row.city,
                "risk_level": row.risk_level,
                "risk_score": row.risk_score,
                "timestamp":  row.timestamp,
                "weather":    json.loads(row.weather or "{}"),
                "reasons":    json.loads(row.reasons or "[]"),
            })
    if not docs:
        raise HTTPException(404, detail=f"No trend data for city: {city}")
    return docs

@app.post("/monitor/refresh")
async def refresh_monitor():
    try:
        await run_monitor()
        return await get_monitor()
    except Exception as e:
        raise HTTPException(500, detail=str(e))


def _risk_emoji(level: str) -> str:
    return {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢"}.get(level, "⚪")

async def _live_monitor_fallback() -> list:
    results = []
    for city in MONITOR_CITIES:
        try:
            w    = await get_weather(city)
            risk = predict_risk(
                temperature=w["temperature"], rainfall=w["rainfall"],
                wind_speed=w["wind_speed"],   humidity=w["humidity"],
            )
            results.append({
                "id":         str(uuid.uuid4()),
                "city":       city,
                "risk_level": risk["risk_level"],
                "risk_score": risk["risk_score"],
                "timestamp":  datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "weather":    w,
                "reasons":    risk["reasons"],
                "emoji":      _risk_emoji(risk["risk_level"]),
            })
        except Exception as e:
            log.error("Fallback failed for %s: %s", city, e)
    return results


# ── Dashboard ─────────────────────────────────────────────
@app.get("/dashboard")
async def dashboard():
    if cached := cache.get("dashboard"):
        return cached
    stats, w = await asyncio.gather(get_stats(), get_weather("Ludhiana"))
    risk     = predict_risk(
        temperature=w["temperature"], rainfall=w["rainfall"],
        wind_speed=w["wind_speed"],   humidity=w["humidity"],
    )
    result = {
        "active_sos":   stats["active"],
        "total_sos":    stats["total"],
        "resolved_sos": stats["resolved"],
        "current_risk": risk["risk_level"],
        "risk_score":   risk["risk_score"],
        "risk_color":   risk["color"],
        "risk_emoji":   risk["emoji"],
        "risk_reasons": risk["reasons"],
        "risk_advice":  risk["advice"],
        "weather":      w,
    }
    cache.set("dashboard", result, ttl=120)
    return result


# ── Contacts ──────────────────────────────────────────────
@app.post("/contacts", status_code=status.HTTP_201_CREATED)
async def create_contact(data: ContactRequest):
    return {"success": True,
            "contact": await add_contact(data.name, data.phone, data.zone, data.contact_type)}

@app.get("/contacts")
async def list_contacts():
    c = await get_all_contacts()
    return {"total": len(c), "contacts": c}

@app.delete("/contacts/{contact_id}")
async def remove_contact(contact_id: str):
    return await delete_contact(contact_id)

@app.put("/contacts/{contact_id}")
async def edit_contact(contact_id: str, data: ContactRequest):
    return await update_contact(contact_id, data.name, data.phone, data.zone, data.contact_type)


# ── Twilio (legacy — kept for backward compat) ────────────
TWILIO_SID   = os.getenv("TWILIO_SID")
TWILIO_TOKEN = os.getenv("TWILIO_TOKEN")
TWILIO_FROM  = os.getenv("TWILIO_FROM")

def _twilio():
    from twilio.rest import Client
    if not all([TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM]):
        raise HTTPException(503, "Twilio credentials not configured")
    return Client(TWILIO_SID, TWILIO_TOKEN)

async def _sms(client, body, to):
    try:
        m = await asyncio.to_thread(client.messages.create, body=body,
                                    from_=TWILIO_FROM, to=to)
        return {"number": to, "status": "sent", "sid": m.sid}
    except Exception as e:
        return {"number": to, "status": "failed", "error": str(e)}

async def _call(client, twiml, to):
    try:
        c = await asyncio.to_thread(client.calls.create, twiml=twiml,
                                    from_=TWILIO_FROM, to=to)
        return {"number": to, "status": "calling", "sid": c.sid}
    except Exception as e:
        return {"number": to, "status": "failed", "error": str(e)}

@app.post("/contacts/sms")
async def send_sms(payload: dict):
    client  = _twilio()
    results = await asyncio.gather(
        *[_sms(client, payload["message"], n) for n in payload.get("numbers", [])])
    return {"success": True, "results": list(results)}

@app.post("/contacts/ivr")
async def trigger_ivr(payload: dict):
    client  = _twilio()
    twiml   = f'<Response><Say voice="alice">{payload["message"]}</Say></Response>'
    results = await asyncio.gather(
        *[_call(client, twiml, n) for n in payload.get("numbers", [])])
    return {"success": True, "results": list(results)}


# ── Model Retraining ──────────────────────────────────────
@app.post("/retrain")
async def retrain(background_tasks: BackgroundTasks):
    async def do_retrain():
        log.info("Starting model retraining...")
        results = await retrain_models(use_real_data=True)
        log.info("Retraining complete: %s", results)
    background_tasks.add_task(do_retrain)
    return {"message": "Retraining started in background."}

@app.get("/model/status")
async def model_status():
    summary_path = "ml/training_results.json"
    if not os.path.exists(summary_path):
        return {"status": "No training results found. Run POST /retrain first."}
    with open(summary_path) as f:
        return {"status": "ready", "results": json.load(f)}