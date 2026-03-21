import json, uuid
from datetime import datetime
from sqlalchemy import select, update, func
from database.db import get_db
from database.models import SOSSignal

def _to_dict(row: SOSSignal) -> dict:
    return {
        "id":           row.id,
        "name":         row.name,
        "location":     row.location,
        "latitude":     row.latitude,
        "longitude":    row.longitude,
        "people_count": row.people_count,
        "message":      row.message,
        "status":       row.status,
        "timestamp":    row.timestamp,
        "media":        json.loads(row.media or "[]"),
    }

async def save_sos(name, location, latitude, longitude,
                   people_count, message, media=[]) -> dict:
    async with get_db() as session:
        signal = SOSSignal(
            id=str(uuid.uuid4()),
            name=name, location=location,
            latitude=latitude, longitude=longitude,
            people_count=people_count, message=message,
            media=json.dumps(media), status="ACTIVE",
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        session.add(signal)
        await session.commit()
        await session.refresh(signal)
        return _to_dict(signal)

async def fetch_all_sos() -> list:
    async with get_db() as session:
        result = await session.execute(
            select(SOSSignal).order_by(SOSSignal.timestamp.desc()))
        return [_to_dict(r) for r in result.scalars().all()]

async def resolve_sos_db(sos_id: str) -> dict:
    async with get_db() as session:
        result = await session.execute(
            update(SOSSignal).where(SOSSignal.id == sos_id)
            .values(status="RESOLVED").returning(SOSSignal.id))
        await session.commit()
        if not result.fetchone():
            return {"error": "SOS not found"}
        return {"success": True, "id": sos_id}

async def update_sos_location(sos_id: str, lat: float, lng: float) -> dict:
    async with get_db() as session:
        await session.execute(
            update(SOSSignal).where(SOSSignal.id == sos_id)
            .values(latitude=lat, longitude=lng))
        await session.commit()
        return {"success": True, "id": sos_id, "latitude": lat, "longitude": lng}

async def get_stats() -> dict:
    async with get_db() as session:
        total    = await session.scalar(select(func.count()).select_from(SOSSignal))
        active   = await session.scalar(select(func.count()).select_from(SOSSignal).where(SOSSignal.status == "ACTIVE"))
        resolved = await session.scalar(select(func.count()).select_from(SOSSignal).where(SOSSignal.status == "RESOLVED"))
        return {"total": total, "active": active, "resolved": resolved}