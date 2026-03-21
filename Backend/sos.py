"""
sos.py  –  Sahaay SOS Router v3.0
"""
import os, shutil, uuid, asyncio, logging
from typing import List
import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from database.sos_db import fetch_all_sos, resolve_sos_db, save_sos

log        = logging.getLogger("sahaay.sos")
router     = APIRouter()
UPLOAD_DIR = "uploads"
MAX_FILE_BYTES = 20 * 1024 * 1024
ALLOWED_TYPES  = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/quicktime", "video/webm",
}
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def geocode_location(place: str) -> tuple[float, float]:
    """Convert a place name to (lat, lng) using Nominatim (free, no key needed)."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res  = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": place + ", India", "format": "json", "limit": 1},
                headers={"User-Agent": "SAHAAY-DisasterApp/1.0"}
            )
            data = res.json()
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        log.warning("Geocoding failed for '%s': %s", place, e)
    return 0.0, 0.0


def _save_file(file: UploadFile, sos_id: str) -> str:
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, detail=f"Unsupported file type: {file.content_type}")
    ext      = os.path.splitext(file.filename or "file")[1].lower() or ".bin"
    filename = f"{sos_id}_{uuid.uuid4().hex}{ext}"
    path     = os.path.join(UPLOAD_DIR, filename)
    bytes_written = 0
    with open(path, "wb") as f:
        while chunk := file.file.read(1024 * 256):
            bytes_written += len(chunk)
            if bytes_written > MAX_FILE_BYTES:
                f.close(); os.remove(path)
                raise HTTPException(413, detail=f"{file.filename} exceeds 20MB limit")
            f.write(chunk)
    return f"/uploads/{filename}"


@router.post("/sos", status_code=status.HTTP_201_CREATED)
async def create_sos(
    name:         str  = Form(...),
    location:     str  = Form(...),
    people_count: int  = Form(...),
    message:      str  = Form(""),
    files: List[UploadFile] = File(default=[]),
):
    # Auto-geocode the place name — citizen only needs to type location
    lat, lng = await geocode_location(location)

    if lat == 0.0 and lng == 0.0:
        log.warning("Could not geocode location: %s — storing with zero coords", location)

    sos_id     = uuid.uuid4().hex[:12]
    media_urls = [_save_file(f, sos_id) for f in files if f.filename]

    signal = await save_sos(
        name=name, location=location,
        latitude=lat, longitude=lng,
        people_count=people_count, message=message,
        media=media_urls,
    )

    try:
        from main import ws_manager
        await ws_manager.broadcast({"type": "new_sos", "signal": signal})
    except Exception:
        pass

    log.info("New SOS #%s from %s at %s (%.4f, %.4f)", signal.get("id"), name, location, lat, lng)
    return {"success": True, "signal": signal}


@router.get("/sos")
async def get_sos():
    signals = await fetch_all_sos()
    return {
        "total":   len(signals),
        "active":  sum(1 for s in signals if s["status"] == "ACTIVE"),
        "signals": signals,
    }


@router.patch("/sos/{sos_id}/resolve", status_code=status.HTTP_200_OK)
async def resolve_sos(sos_id: str):
    result = await resolve_sos_db(sos_id)
    try:
        from main import ws_manager
        await ws_manager.broadcast({"type": "resolve_sos", "sos_id": sos_id})
    except Exception:
        pass
    return result