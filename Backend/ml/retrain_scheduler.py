"""
retrain_scheduler.py — Auto-retrain when new data is available
"""
import logging
from pathlib import Path

log      = logging.getLogger("sahaay.retrain")
DATA_DIR = Path(__file__).parent / "data"
MIN_NEW_ROWS_TO_RETRAIN = 200

def should_retrain() -> bool:
    csv             = DATA_DIR / "training_data.csv"
    last_count_file = DATA_DIR / "last_train_count.txt"
    if not csv.exists(): return False
    current_count = sum(1 for _ in open(csv)) - 1
    if not last_count_file.exists():
        return current_count >= MIN_NEW_ROWS_TO_RETRAIN
    last_count = int(last_count_file.read_text().strip() or "0")
    new_rows   = current_count - last_count
    log.info("Data rows: %d total, %d new since last train", current_count, new_rows)
    return new_rows >= MIN_NEW_ROWS_TO_RETRAIN

async def retrain_if_needed():
    if not should_retrain(): return
    log.info("🔁 Retraining triggered — new data available")
    import asyncio
    from ml.disaster_model import train_all_models   # ← fixed import

    results = await train_all_models(use_real_data=True)

    csv   = DATA_DIR / "training_data.csv"
    count = sum(1 for _ in open(csv)) - 1
    (DATA_DIR / "last_train_count.txt").write_text(str(count))
    log.info("✅ Retrain complete.")