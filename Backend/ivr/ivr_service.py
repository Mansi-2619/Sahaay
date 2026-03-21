"""
ivr_service.py  —  Sahaay IVR Call Manager
-------------------------------------------
Handles:
  • Outbound alert calls (single + broadcast to multiple)
  • Inbound citizen emergency calls with DTMF menu
  • Confirmation tracking per alert
  • Auto-trigger on HIGH/CRITICAL risk or new SOS
"""

import asyncio
import logging
import time
import threading
import uuid
from typing import Optional

from ivr.modem_bridge import modem
from ivr.tts_engine   import (
    text_to_wav, play_wav, AUDIO_DIR,
    ensure_prompts, generate_dynamic_prompt, PROMPTS
)

log = logging.getLogger("sahaay.ivr")

# Per-alert confirmation tracking: { alert_id: { "digit": "1"|"2", "caller": "..." } }
_confirmations: dict[str, dict] = {}

# Call log: list of recent call records
_call_log: list[dict] = []


def _play(name: str):
    """Play a named pre-generated prompt."""
    wav = AUDIO_DIR / f"{name}.wav"
    if wav.exists():
        play_wav(wav)
    else:
        log.warning("Prompt not found: %s.wav", name)


def _play_text(text: str, cache_key: str):
    """Generate + play dynamic TTS."""
    try:
        wav = generate_dynamic_prompt(text, cache_key)
        play_wav(wav)
    except Exception as e:
        log.error("Dynamic TTS failed: %s", e)


def _log_call(number: str, alert_id: str, call_type: str, status: str):
    """Store call result in memory log (last 200 calls)."""
    from datetime import datetime
    _call_log.append({
        "id":         str(uuid.uuid4()),
        "number":     number,
        "alert_id":   alert_id,
        "type":       call_type,
        "status":     status,
        "timestamp":  datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })
    if len(_call_log) > 200:
        _call_log.pop(0)


# ── Outbound: single responder call ──────────────────────

def call_responder(
    number:     str,
    alert_id:   str,
    alert_type: str = "sos",      # "sos" | "risk"
    zone:       str = "",
    risk_level: str = "HIGH",
    timeout:    int = 30,
) -> dict:
    """
    Call one responder:
    1. Dial via Android modem
    2. Play alert message
    3. Wait for DTMF key (1=confirm, 2=unavailable)
    4. Return result dict
    """
    log.info("📞 Calling %s | alert=%s type=%s", number, alert_id, alert_type)

    # ── Dial ─────────────────────────────────────────────
    if not modem.dial(number):
        result = {"number": number, "status": "call_failed", "alert_id": alert_id}
        _log_call(number, alert_id, alert_type, "call_failed")
        return result

    # ── Wait for OFFHOOK (answered) ───────────────────────
    deadline = time.time() + 25
    while time.time() < deadline:
        state = modem.get_call_state()
        if state == "OFFHOOK":
            break
        if state == "IDLE":
            _log_call(number, alert_id, alert_type, "no_answer")
            return {"number": number, "status": "no_answer", "alert_id": alert_id}
        time.sleep(1)
    else:
        modem.hangup()
        _log_call(number, alert_id, alert_type, "no_answer")
        return {"number": number, "status": "no_answer", "alert_id": alert_id}

    # ── Play alert ────────────────────────────────────────
    time.sleep(1)
    _play("alert_sos" if alert_type == "sos" else "alert_risk")

    if zone:
        _play_text(
            f"This alert is for zone {zone}. Risk level is {risk_level}.",
            f"zone_{zone}_{risk_level}".replace(" ", "_").lower()
        )

    _play("press1")

    # ── Wait for DTMF confirmation ────────────────────────
    _confirmations[alert_id] = {}
    status   = "no_response"
    deadline = time.time() + timeout

    while time.time() < deadline:
        state = modem.get_call_state()
        if state == "IDLE":
            break   # caller hung up

        digit = _confirmations.get(alert_id, {}).get("digit")
        if digit == "1":
            status = "confirmed"
            _play("confirmed")
            break
        elif digit == "2":
            status = "unavailable"
            _play("unavailable")
            break

        time.sleep(0.5)

    modem.hangup()
    log.info("📵 Call to %s done — %s", number, status)
    _log_call(number, alert_id, alert_type, status)
    return {"number": number, "status": status, "alert_id": alert_id}


# ── Outbound: broadcast to multiple responders ────────────

def broadcast_alert(
    numbers:    list[str],
    alert_id:   str,
    alert_type: str = "sos",
    zone:       str = "",
    risk_level: str = "HIGH",
    stop_on_confirm: bool = True,
) -> list[dict]:
    """
    Call all responders one by one (one SIM = one call at a time).
    Stops early if someone confirms (stop_on_confirm=True).
    """
    log.info("📢 Broadcasting to %d numbers for alert %s", len(numbers), alert_id)
    results = []

    for number in numbers:
        result = call_responder(
            number=number, alert_id=alert_id,
            alert_type=alert_type, zone=zone, risk_level=risk_level,
        )
        results.append(result)

        if stop_on_confirm and result["status"] == "confirmed":
            log.info("✅ Alert %s confirmed by %s — stopping broadcast", alert_id, number)
            break

        time.sleep(2)   # brief pause between calls

    confirmed = sum(1 for r in results if r["status"] == "confirmed")
    log.info("📢 Broadcast done: %d/%d confirmed", confirmed, len(results))
    return results


async def broadcast_alert_async(
    numbers:    list[str],
    alert_id:   str,
    alert_type: str = "sos",
    zone:       str = "",
    risk_level: str = "HIGH",
) -> list[dict]:
    """Async wrapper — runs in thread pool so FastAPI doesn't block."""
    return await asyncio.to_thread(
        broadcast_alert, numbers, alert_id, alert_type, zone, risk_level
    )


# ── Inbound: citizen calls in ─────────────────────────────

def handle_inbound(caller_number: str):
    """
    Full inbound IVR flow:
    1. Answer call
    2. Play welcome menu
    3. Collect DTMF digit
    4. Take action (create SOS or read risk level)
    """
    import requests
    log.info("📲 Inbound IVR from %s", caller_number)

    modem.answer()
    time.sleep(1)
    _play("connecting")
    time.sleep(0.5)
    _play("welcome")

    # Collect DTMF
    digit_buffer = []

    def on_digit(d):
        digit_buffer.append(d)

    modem.on_dtmf = on_digit

    deadline = time.time() + 10
    while time.time() < deadline and not digit_buffer:
        time.sleep(0.3)

    digit = digit_buffer[0] if digit_buffer else None
    log.info("Inbound DTMF from %s: %s", caller_number, digit)

    if digit == "1":
        # Create SOS via backend API
        _play("report")
        try:
            requests.post("http://localhost:8000/sos/phone", json={
                "caller_number": caller_number,
                "source":        "ivr_inbound",
                "message":       "Emergency reported via phone call",
            }, timeout=5)
            log.info("✅ Phone SOS created for %s", caller_number)
        except Exception as e:
            log.error("SOS API error: %s", e)
        _play("thankyou")

    elif digit == "2":
        # Read current risk level from backend
        try:
            res        = requests.get("http://localhost:8000/dashboard", timeout=5)
            risk       = res.json().get("current_risk", "LOW").lower()
            prompt_key = f"risk_{risk}"
            if prompt_key in PROMPTS:
                _play(prompt_key)
            else:
                _play("risk_low")
        except Exception:
            _play("risk_low")
        _play("thankyou")

    elif digit == "0":
        # Repeat — recurse once
        modem.on_dtmf = None
        handle_inbound(caller_number)
        return

    else:
        _play("invalid")
        _play("thankyou")

    modem.on_dtmf = None
    modem.hangup()
    _log_call(caller_number, "inbound", "inbound", f"digit_{digit or 'none'}")


# ── Startup / Shutdown ────────────────────────────────────

def start_ivr():
    """
    Call from main.py lifespan startup.
    Generates audio prompts and starts Android modem monitor.
    Safe to call even if phone is not connected.
    """
    log.info("🔊 Starting Sahaay IVR system...")
    ensure_prompts()

    if not modem.check_connected():
        log.warning(
            "⚠️  Android phone not connected — IVR in DEMO mode\n"
            "    Connect phone via USB with USB Debugging enabled to activate real calls"
        )
        return

    # Wire up inbound handler
    modem.on_incoming = lambda number: threading.Thread(
        target=handle_inbound, args=(number,), daemon=True
    ).start()

    modem.start_monitor()
    log.info("✅ IVR system ACTIVE — Android modem connected")


def stop_ivr():
    """Call from main.py lifespan shutdown."""
    modem.stop_monitor()
    log.info("IVR system stopped")


def get_call_log() -> list[dict]:
    """Return recent call history for dashboard."""
    return list(reversed(_call_log))