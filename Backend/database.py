# D:\Sahaay\Sahaay\Backend\database.py

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# ── Connection string ──────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:sahaay123@localhost:5432/sahaay_db")


engine = create_engine(POSTGRES_URL, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_connection():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ PostgreSQL connected successfully!")
        return True
    except Exception as e:
        print(f"❌ PostgreSQL connection failed: {e}")
        return False