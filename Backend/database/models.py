from sqlalchemy import Column, String, Float, Integer, Text
from database.db import Base

class SOSSignal(Base):
    __tablename__ = "sos_signals"
    id           = Column(String, primary_key=True)
    name         = Column(String(100))
    location     = Column(String(500))
    latitude     = Column(Float)
    longitude    = Column(Float)
    people_count = Column(Integer)
    message      = Column(Text, default="")
    status       = Column(String(20), default="ACTIVE")
    timestamp    = Column(String(30))
    media        = Column(Text, default="[]")

class Contact(Base):
    __tablename__ = "contacts"
    id         = Column(String, primary_key=True)
    name       = Column(String(100))
    phone      = Column(String(30))
    zone       = Column(String(100))
    type       = Column(String(50))
    created_at = Column(String(30))

class Alert(Base):
    __tablename__ = "alerts"
    id        = Column(String, primary_key=True)
    zone      = Column(String(100))
    type      = Column(String(50))
    severity  = Column(String(20))
    message   = Column(Text)
    channels  = Column(Text, default="[]")
    auto      = Column(String(5), default="false")
    timestamp = Column(String(30))

class RiskSnapshot(Base):
    __tablename__ = "risk_snapshots"
    id         = Column(String, primary_key=True)
    city       = Column(String(100))
    risk_level = Column(String(20))
    risk_score = Column(Float)
    timestamp  = Column(String(30))
    weather    = Column(Text, default="{}")
    reasons    = Column(Text, default="[]")