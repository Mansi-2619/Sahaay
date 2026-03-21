"""
predict_disaster.py  –  Sahaay Prediction Engine v3.0
-------------------------------------------------------
- Loads XGBoost models trained by train.py
- Returns CRITICAL level when HIGH probability > 85%
- Returns feature importance so dashboard can explain predictions
- Graceful fallback to rule-based prediction if models missing
"""

import logging
import os
from pathlib import Path

import joblib
import numpy as np

from ml.train import DISASTER_FEATURES

log       = logging.getLogger("sahaay.predict")
MODEL_DIR = Path(__file__).parent

RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"]


def _load(name: str):
    path = MODEL_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Model file not found: {path}. Run ml/train.py first.")
    return joblib.load(path)


def predict_disaster(disaster_type: str, input_data: dict) -> dict:
    """
    Predict risk for a single disaster type.
    Returns risk_level, probability, all_probabilities, confidence, top_features.
    """
    try:
        model  = _load(f"{disaster_type}_model.pkl")
        scaler = _load(f"{disaster_type}_scaler.pkl")
        le     = _load("label_encoder.pkl")
    except FileNotFoundError as exc:
        log.warning("%s — falling back to rules: %s", disaster_type, exc)
        return _rule_based_fallback(disaster_type, input_data)

    features = DISASTER_FEATURES[disaster_type]
    X        = np.array([[input_data.get(f, 0.0) for f in features]], dtype=float)
    X_scaled = scaler.transform(X)

    pred_idx   = model.predict(X_scaled)[0]
    proba      = model.predict_proba(X_scaled)[0]
    risk_level = le.inverse_transform([pred_idx])[0]

    prob_dict = {
        le.inverse_transform([i])[0]: round(float(p) * 100, 1)
        for i, p in enumerate(proba)
    }

    # Upgrade to CRITICAL if HIGH probability > 85%
    if risk_level == "HIGH" and prob_dict.get("HIGH", 0) > 85:
        risk_level = "CRITICAL"

    # Feature importance (top 3)
    top_features = []
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        top_idx     = np.argsort(importances)[::-1][:3]
        top_features = [
            {"feature": features[i], "importance": round(float(importances[i]), 3)}
            for i in top_idx
        ]

    return {
        "disaster_type":    disaster_type,
        "risk_level":       risk_level,
        "probability":      prob_dict.get(risk_level, 0),
        "all_probabilities": prob_dict,
        "confidence":       "HIGH" if max(proba) > 0.7 else "MEDIUM" if max(proba) > 0.5 else "LOW",
        "top_features":     top_features,
    }


def predict_all(input_data: dict) -> dict:
    """
    Run all 4 disaster predictions and return combined result.
    Also returns overall_highest_risk across all types.
    """
    risk_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
    predictions = {}
    for dtype in DISASTER_FEATURES:
        predictions[dtype] = predict_disaster(dtype, input_data)

    overall = max(
        predictions.values(),
        key=lambda d: risk_order.get(d["risk_level"], 0)
    )["risk_level"]

    return {
        "predictions":          predictions,
        "overall_highest_risk": overall,
        "input_used":           input_data,
    }


# ── Rule-based fallback (if models not trained yet) ──────

def _rule_based_fallback(disaster_type: str, d: dict) -> dict:
    risk = "LOW"
    if disaster_type == "flood":
        if d.get("rainfall_mm", 0) > 80 or d.get("river_level_m", 0) > 4:
            risk = "HIGH"
        elif d.get("rainfall_mm", 0) > 25:
            risk = "MEDIUM"
    elif disaster_type == "heatwave":
        t = d.get("temperature_c", 25)
        if t > 45: risk = "HIGH"
        elif t > 38: risk = "MEDIUM"
    elif disaster_type == "air_quality":
        aqi = d.get("aqi", 0)
        if aqi > 200: risk = "HIGH"
        elif aqi > 100: risk = "MEDIUM"
    elif disaster_type == "earthquake":
        sa = d.get("seismic_activity", 0)
        if sa > 4: risk = "HIGH"
        elif sa > 2: risk = "MEDIUM"

    prob = {"LOW": 0.0, "MEDIUM": 0.0, "HIGH": 0.0}
    prob[risk] = 100.0
    return {
        "disaster_type":     disaster_type,
        "risk_level":        risk,
        "probability":       100.0,
        "all_probabilities": prob,
        "confidence":        "LOW",
        "top_features":      [],
    }