import uuid
from datetime import datetime
from sqlalchemy import select, update, delete
from database.db import get_db
from database.models import Contact


def _to_dict(row: Contact) -> dict:
    return {
        "id":         str(row.id),
        "name":       row.name,
        "phone":      row.phone,
        "zone":       row.zone,
        "type":       row.type,
        "created_at": str(row.created_at),
    }


async def add_contact(name, phone, zone, contact_type) -> dict:
    async with get_db() as session:
        contact = Contact(
            id=str(uuid.uuid4()),
            name=name, phone=phone,
            zone=zone, type=contact_type,
            created_at=datetime.utcnow().isoformat(),
        )
        session.add(contact)
        await session.commit()
        await session.refresh(contact)
        return _to_dict(contact)


async def get_all_contacts() -> list:
    async with get_db() as session:
        result = await session.execute(select(Contact))
        return [_to_dict(r) for r in result.scalars().all()]


async def delete_contact(contact_id: str) -> dict:
    async with get_db() as session:
        await session.execute(delete(Contact).where(Contact.id == contact_id))
        await session.commit()
        return {"deleted": True}


async def update_contact(contact_id, name, phone, zone, contact_type) -> dict:
    async with get_db() as session:
        await session.execute(
            update(Contact)
            .where(Contact.id == contact_id)
            .values(name=name, phone=phone, zone=zone, type=contact_type)
        )
        await session.commit()
        return {"updated": True}