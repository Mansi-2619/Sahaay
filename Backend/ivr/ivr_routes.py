"""
ivr_routes.py  —  Sahaay IVR API Routes
Add this router to your main.py:

    from ivr.ivr_routes import router as ivr_router
    app.include_router(ivr_router)

And in your lifespan:
    from ivr.ivr_service import start_ivr, stop_ivr
    start_ivr()   # on startup
    stop_ivr()    # on shutdown
"""

import uuid
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List

from ivr.ivr_service import (
    broadcast_alert_async,
    _confirmations,
    get_call_log,
)

router = APIRouter(prefix="/ivr", tags=["IVR"])


# ── Request models ────────────────────────────────────────

class CallRequest(BaseModel):
    numbers:    List[str]
    alert_type: str            = "sos"   # "sos" | "risk"
    zone:       str            = ""
    risk_level: str            = "HIGH"
    alert_id:   Optional[str]  = None


class ConfirmRequest(BaseModel):
    caller:   str
    alert_id: str
    digit:    Optional[str] = None
    status:   Optional[str] = None   # "confirmed" | "unavailable" | "no_response"


class PhoneSosRequest(BaseModel):
    caller_number: str
    source:        str = "ivr_inbound"
    message:       str = "Emergency reported via phone call"


# ── Routes ────────────────────────────────────────────────

@router.post("/call")
async def trigger_ivr_call(req: CallRequest):
    """
    Manually trigger an IVR broadcast from the admin dashboard.
    POST /ivr/call
    Body: { numbers: ["+91..."], alert_type: "sos", zone: "Ludhiana", risk_level: "HIGH" }
    """
    from database.db     import get_db
    from database.models import Contact
    from sqlalchemy      import select

    alert_id = req.alert_id or str(uuid.uuid4())
    numbers  = req.numbers

    # If no numbers provided, auto-fetch responders for the zone
    if not numbers:
        async with get_db() as session:
            query    = select(Contact)
            if req.zone:
                query = query.where(Contact.zone == req.zone)
            result   = await session.execute(query)
            contacts = result.scalars().all()
            numbers  = [c.phone for c in contacts if c.phone]

    if not numbers:
        return {"success": False, "error": "No responder numbers found for this zone"}

    results = await broadcast_alert_async(
        numbers    = numbers,
        alert_id   = alert_id,
        alert_type = req.alert_type,
        zone       = req.zone,
        risk_level = req.risk_level,
    )

    confirmed = sum(1 for r in results if r["status"] == "confirmed")
    return {
        "success":   True,
        "alert_id":  alert_id,
        "called":    len(results),
        "confirmed": confirmed,
        "results":   results,
    }


@router.post("/confirm")
async def ivr_confirm(req: ConfirmRequest):
    """
    Called when a responder presses a DTMF key during an alert call.
    POST /ivr/confirm
    """
    digit = req.digit
    if not digit:
        # Map status string → digit
        digit = "1" if req.status == "confirmed" else "2"

    _confirmations[req.alert_id] = {
        "digit":  digit,
        "caller": req.caller,
    }
    return {"ok": True, "alert_id": req.alert_id, "digit": digit}


@router.get("/calls")
async def get_ivr_call_log():
    """Return recent IVR call history for the admin dashboard."""
    return {"calls": get_call_log()}


@router.get("/status")
async def ivr_status():
    """Check if Android modem is connected and IVR is active."""
    from ivr.modem_bridge import modem
    connected = modem.check_connected()
    return {
        "connected":   connected,
        "active_call": modem.active_call,
        "status":      "active" if connected else "demo_mode",
        "message":     "Android modem connected" if connected
                       else "Phone not connected — connect via USB with USB Debugging enabled",
    }