"""
Sahaay Disaster Prediction - XGBoost Model v2.0
Real data from Open-Meteo API + auto-retraining pipeline
"""
from __future__ import annotations
import os, json, joblib, asyncio, logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import httpx
from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

logger    = logging.getLogger(__name__)
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR  = os.path.join(MODEL_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

INDIAN_CITIES = [
    {"name": "Mumbai",     "lat": 19.076, "lon": 72.877},
    {"name": "Delhi",      "lat": 28.679, "lon": 77.069},
    {"name": "Ludhiana",   "lat": 30.901, "lon": 75.857},
    {"name": "Chennai",    "lat": 13.083, "lon": 80.270},
    {"name": "Kolkata",    "lat": 22.572, "lon": 88.363},
    {"name": "Bangalore",  "lat": 12.972, "lon": 77.594},
    {"name": "Hyderabad",  "lat": 17.385, "lon": 78.486},
    {"name": "Ahmedabad",  "lat": 23.022, "lon": 72.572},
    {"name": "Pune",       "lat": 18.521, "lon": 73.856},
    {"name": "Jaipur",     "lat": 26.912, "lon": 75.787},
    {"name": "Bhopal",     "lat": 23.259, "lon": 77.412},
    {"name": "Amritsar",   "lat": 31.634, "lon": 74.872},
    {"name": "Chandigarh", "lat": 30.733, "lon": 76.779},
    {"name": "Patna",      "lat": 25.594, "lon": 85.137},
    {"name": "Guwahati",   "lat": 26.144, "lon": 91.736},
]

DISASTER_FEATURES = {
    "flood": [
        "rainfall_mm", "humidity_pct", "temperature_c",
        "wind_speed_kmh", "consecutive_rain_days",
        "rainfall_7day_sum", "humidity_7day_avg",
    ],
    "earthquake": [
        "seismic_activity", "ground_vibration", "historical_quakes_5yr",
        "fault_distance_km", "depth_km", "foreshock_count",
    ],
    "heatwave": [
        "temperature_c", "humidity_pct", "heat_index",
        "consecutive_hot_days", "wind_speed_kmh",
        "temp_7day_avg", "temp_max_7day",
    ],
    "air_quality": [
        "pm2_5", "pm10", "aqi", "temperature_c",
        "wind_speed_kmh", "humidity_pct",
        "temp_7day_avg", "wind_7day_avg",
    ],
}

RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"]


# ═══════════════════════════════════════════════════════════
#  REAL DATA FETCHER
# ═══════════════════════════════════════════════════════════

async def fetch_historic_weather(lat: float, lon: float, days: int = 365) -> Optional[pd.DataFrame]:
    end   = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    url   = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={start}&end_date={end}"
        f"&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,"
        f"precipitation_sum,windspeed_10m_max,relative_humidity_2m_max,"
        f"relative_humidity_2m_min"
        f"&timezone=Asia/Kolkata"
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res  = await client.get(url)
            data = res.json()
        daily = data.get("daily", {})
        df = pd.DataFrame({
            "date":         daily.get("time", []),
            "temp_max":     daily.get("temperature_2m_max", []),
            "temp_min":     daily.get("temperature_2m_min", []),
            "temp_mean":    daily.get("temperature_2m_mean", []),
            "rainfall_mm":  daily.get("precipitation_sum", []),
            "wind_speed":   daily.get("windspeed_10m_max", []),
            "humidity_max": daily.get("relative_humidity_2m_max", []),
            "humidity_min": daily.get("relative_humidity_2m_min", []),
        })
        df["date"]         = pd.to_datetime(df["date"])
        df["humidity_pct"] = (df["humidity_max"] + df["humidity_min"]) / 2
        return df.dropna()
    except Exception as e:
        logger.error("Failed to fetch weather data: %s", e)
        return None


async def fetch_all_cities_data(days: int = 730) -> pd.DataFrame:
    all_dfs = []
    for city in INDIAN_CITIES:
        logger.info("Fetching data for %s...", city["name"])
        df = await fetch_historic_weather(city["lat"], city["lon"], days)
        if df is not None:
            df["city"] = city["name"]
            all_dfs.append(df)
        await asyncio.sleep(0.5)
    if not all_dfs:
        return pd.DataFrame()
    combined = pd.concat(all_dfs, ignore_index=True)
    combined.to_csv(os.path.join(DATA_DIR, "historic_weather.csv"), index=False)
    logger.info("Saved %d rows of historic data", len(combined))
    return combined


# ═══════════════════════════════════════════════════════════
#  FEATURE ENGINEERING
# ═══════════════════════════════════════════════════════════

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["city", "date"]).copy()
    grp = df.groupby("city")

    df["rainfall_7day_sum"]     = grp["rainfall_mm"].transform(lambda x: x.rolling(7, min_periods=1).sum())
    df["humidity_7day_avg"]     = grp["humidity_pct"].transform(lambda x: x.rolling(7, min_periods=1).mean())
    df["temp_7day_avg"]         = grp["temp_mean"].transform(lambda x: x.rolling(7, min_periods=1).mean())
    df["temp_max_7day"]         = grp["temp_max"].transform(lambda x: x.rolling(7, min_periods=1).max())
    df["wind_7day_avg"]         = grp["wind_speed"].transform(lambda x: x.rolling(7, min_periods=1).mean())

    df["is_rainy"]              = (df["rainfall_mm"] > 5).astype(int)
    df["consecutive_rain_days"] = grp["is_rainy"].transform(
        lambda x: x * (x.groupby((x != x.shift()).cumsum()).cumcount() + 1))

    df["is_hot"]                = (df["temp_max"] > 38).astype(int)
    df["consecutive_hot_days"]  = grp["is_hot"].transform(
        lambda x: x * (x.groupby((x != x.shift()).cumsum()).cumcount() + 1))

    df["heat_index"]     = df["temp_mean"] + 0.33 * (
        df["humidity_pct"] / 100 * 6.105 *
        np.exp(17.27 * df["temp_mean"] / (237.7 + df["temp_mean"]))) - 4.0

    df["temperature_c"]  = df["temp_mean"]
    df["wind_speed_kmh"] = df["wind_speed"]
    return df


def _label_flood(row) -> str:
    if row["rainfall_mm"] > 80 or row["rainfall_7day_sum"] > 200: return "HIGH"
    if row["rainfall_mm"] > 30 or row["rainfall_7day_sum"] > 80:  return "MEDIUM"
    return "LOW"

def _label_heatwave(row) -> str:
    if row["temp_max"] > 44 or row["consecutive_hot_days"] >= 5: return "HIGH"
    if row["temp_max"] > 38 or row["consecutive_hot_days"] >= 2: return "MEDIUM"
    return "LOW"

def _label_air_quality(row) -> str:
    proxy = (max(0, 40 - row["wind_speed_kmh"]) * 2 +
             max(0, row["humidity_pct"] - 60) * 1.5 +
             max(0, row["temperature_c"] - 30) * 2)
    if proxy > 100: return "HIGH"
    if proxy > 50:  return "MEDIUM"
    return "LOW"


def _add_noise(df: pd.DataFrame, features: list, noise_pct: float = 0.25) -> pd.DataFrame:
    """Add ±25% Gaussian noise to blur decision boundaries."""
    df = df.copy()
    for col in features:
        if col in df.columns:
            std = df[col].std() * noise_pct
            if std > 0:
                df[col] = df[col] + np.random.normal(0, std, len(df))
    return df

def _build_flood_df(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["risk_level"] = d.apply(_label_flood, axis=1)
    features = DISASTER_FEATURES["flood"]
    d = _add_noise(d, features)
    return d[features + ["risk_level"]].dropna()

def _build_heatwave_df(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["risk_level"] = d.apply(_label_heatwave, axis=1)
    features = DISASTER_FEATURES["heatwave"]
    d = _add_noise(d, features)
    return d[features + ["risk_level"]].dropna()

def _build_air_quality_df(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["aqi"]   = d.apply(lambda r: max(0, 40 - r["wind_speed_kmh"]) * 2 +
                          max(0, r["humidity_pct"] - 60) * 1.5 +
                          max(0, r["temperature_c"] - 30) * 2, axis=1)
    d["pm2_5"] = d["aqi"] * 0.4 + np.random.normal(0, 5, len(d))
    d["pm10"]  = d["aqi"] * 0.7 + np.random.normal(0, 8, len(d))
    d["risk_level"] = d.apply(_label_air_quality, axis=1)
    features = DISASTER_FEATURES["air_quality"]
    d = _add_noise(d, features)
    return d[features + ["risk_level"]].dropna()

def _generate_earthquake_data(n: int = 8000) -> pd.DataFrame:
    np.random.seed(42)
    rows = []
    for _ in range(n):
        risk = np.random.choice(RISK_LEVELS, p=[0.60, 0.28, 0.12])
        if risk == "LOW":
            row = {"seismic_activity":      np.random.uniform(0, 2.5),
                   "ground_vibration":      np.random.uniform(0, 1.2),
                   "historical_quakes_5yr": np.random.randint(0, 6),
                   "fault_distance_km":     np.random.uniform(20, 500),
                   "depth_km":              np.random.uniform(15, 100),
                   "foreshock_count":       np.random.randint(0, 4)}
        elif risk == "MEDIUM":
            row = {"seismic_activity":      np.random.uniform(0.8, 5.5),
                   "ground_vibration":      np.random.uniform(0.2, 4.0),
                   "historical_quakes_5yr": np.random.randint(1, 18),
                   "fault_distance_km":     np.random.uniform(2, 120),
                   "depth_km":              np.random.uniform(5, 50),
                   "foreshock_count":       np.random.randint(0, 12)}
        else:
            row = {"seismic_activity":      np.random.uniform(2.5, 8.0),
                   "ground_vibration":      np.random.uniform(1.0, 9.0),
                   "historical_quakes_5yr": np.random.randint(5, 40),
                   "fault_distance_km":     np.random.uniform(0, 40),
                   "depth_km":              np.random.uniform(1, 25),
                   "foreshock_count":       np.random.randint(2, 25)}
        row["risk_level"] = risk
        rows.append(row)
    return pd.DataFrame(rows)

def _generate_synthetic(disaster_type: str, n: int = 3000) -> pd.DataFrame:
    """Fallback synthetic data matching new feature names."""
    np.random.seed(42)
    rows = []
    for _ in range(n):
        risk = np.random.choice(RISK_LEVELS, p=[0.5, 0.3, 0.2])
        if disaster_type == "flood":
            if risk == "LOW":
                row = {"rainfall_mm": np.random.uniform(0, 20),
                       "humidity_pct": np.random.uniform(30, 60),
                       "temperature_c": np.random.uniform(15, 30),
                       "wind_speed_kmh": np.random.uniform(10, 40),
                       "consecutive_rain_days": np.random.randint(0, 2),
                       "rainfall_7day_sum": np.random.uniform(0, 50),
                       "humidity_7day_avg": np.random.uniform(30, 60)}
            elif risk == "MEDIUM":
                row = {"rainfall_mm": np.random.uniform(20, 60),
                       "humidity_pct": np.random.uniform(60, 80),
                       "temperature_c": np.random.uniform(20, 35),
                       "wind_speed_kmh": np.random.uniform(5, 20),
                       "consecutive_rain_days": np.random.randint(2, 5),
                       "rainfall_7day_sum": np.random.uniform(50, 150),
                       "humidity_7day_avg": np.random.uniform(60, 80)}
            else:
                row = {"rainfall_mm": np.random.uniform(60, 200),
                       "humidity_pct": np.random.uniform(80, 100),
                       "temperature_c": np.random.uniform(25, 40),
                       "wind_speed_kmh": np.random.uniform(30, 80),
                       "consecutive_rain_days": np.random.randint(5, 15),
                       "rainfall_7day_sum": np.random.uniform(150, 500),
                       "humidity_7day_avg": np.random.uniform(80, 100)}
        elif disaster_type == "heatwave":
            if risk == "LOW":
                row = {"temperature_c": np.random.uniform(15, 32),
                       "humidity_pct": np.random.uniform(30, 60),
                       "heat_index": np.random.uniform(15, 32),
                       "consecutive_hot_days": np.random.randint(0, 2),
                       "wind_speed_kmh": np.random.uniform(15, 40),
                       "temp_7day_avg": np.random.uniform(15, 32),
                       "temp_max_7day": np.random.uniform(20, 35)}
            elif risk == "MEDIUM":
                row = {"temperature_c": np.random.uniform(32, 40),
                       "humidity_pct": np.random.uniform(20, 50),
                       "heat_index": np.random.uniform(35, 45),
                       "consecutive_hot_days": np.random.randint(2, 5),
                       "wind_speed_kmh": np.random.uniform(5, 15),
                       "temp_7day_avg": np.random.uniform(30, 40),
                       "temp_max_7day": np.random.uniform(35, 44)}
            else:
                row = {"temperature_c": np.random.uniform(40, 50),
                       "humidity_pct": np.random.uniform(10, 30),
                       "heat_index": np.random.uniform(45, 65),
                       "consecutive_hot_days": np.random.randint(5, 20),
                       "wind_speed_kmh": np.random.uniform(0, 5),
                       "temp_7day_avg": np.random.uniform(40, 50),
                       "temp_max_7day": np.random.uniform(44, 52)}
        elif disaster_type == "air_quality":
            if risk == "LOW":
                row = {"pm2_5": np.random.uniform(0, 30),
                       "pm10": np.random.uniform(0, 50),
                       "aqi": np.random.uniform(0, 50),
                       "temperature_c": np.random.uniform(15, 28),
                       "wind_speed_kmh": np.random.uniform(15, 40),
                       "humidity_pct": np.random.uniform(30, 60),
                       "temp_7day_avg": np.random.uniform(15, 28),
                       "wind_7day_avg": np.random.uniform(15, 40)}
            elif risk == "MEDIUM":
                row = {"pm2_5": np.random.uniform(30, 90),
                       "pm10": np.random.uniform(50, 150),
                       "aqi": np.random.uniform(50, 150),
                       "temperature_c": np.random.uniform(28, 38),
                       "wind_speed_kmh": np.random.uniform(5, 15),
                       "humidity_pct": np.random.uniform(60, 80),
                       "temp_7day_avg": np.random.uniform(28, 38),
                       "wind_7day_avg": np.random.uniform(5, 15)}
            else:
                row = {"pm2_5": np.random.uniform(90, 300),
                       "pm10": np.random.uniform(150, 500),
                       "aqi": np.random.uniform(150, 500),
                       "temperature_c": np.random.uniform(35, 48),
                       "wind_speed_kmh": np.random.uniform(0, 5),
                       "humidity_pct": np.random.uniform(80, 100),
                       "temp_7day_avg": np.random.uniform(35, 48),
                       "wind_7day_avg": np.random.uniform(0, 5)}
        else:
            return _generate_earthquake_data(n)
        row["risk_level"] = risk
        rows.append(row)
    return pd.DataFrame(rows)


# ═══════════════════════════════════════════════════════════
#  XGBOOST TRAINER
# ═══════════════════════════════════════════════════════════
def _train_xgboost(X_train, y_train, X_test, y_test) -> XGBClassifier:
    model = XGBClassifier(
        n_estimators=200,
        max_depth=3,           # very shallow
        learning_rate=0.05,
        subsample=0.6,
        colsample_bytree=0.6,
        min_child_weight=20,   # very conservative
        gamma=1.0,
        reg_alpha=2.0,
        reg_lambda=10.0,       # heavy regularization
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=15,
    )
    model.fit(X_train, y_train,
              eval_set=[(X_test, y_test)],
              verbose=False)
    return model

def predict_disaster(disaster_type: str, input_data: dict) -> dict:
    model_path = os.path.join(MODEL_DIR, f"{disaster_type}_model.pkl")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model for {disaster_type} not found. Run /retrain first.")

    model  = joblib.load(model_path)
    scaler = joblib.load(os.path.join(MODEL_DIR, f"{disaster_type}_scaler.pkl"))
    le     = joblib.load(os.path.join(MODEL_DIR, "label_encoder.pkl"))

    features  = DISASTER_FEATURES[disaster_type]
    X         = np.array([[input_data.get(f, 0) for f in features]])
    X_sc      = scaler.transform(X)
    pred_idx  = model.predict(X_sc)[0]
    proba     = model.predict_proba(X_sc)[0]
    risk      = le.inverse_transform([pred_idx])[0]
    prob_dict = {le.inverse_transform([i])[0]: round(float(p) * 100, 1)
                 for i, p in enumerate(proba)}

    return {
        "disaster_type":     disaster_type,
        "risk_level":        risk,
        "probability":       prob_dict[risk],
        "all_probabilities": prob_dict,
    }


if __name__ == "__main__":
    asyncio.run(train_all_models(use_real_data=True))
    
async def train_all_models(use_real_data: bool = True) -> dict:
    results = {}
    le      = LabelEncoder()
    le.fit(RISK_LEVELS)
    real_df = None

    if use_real_data:
        logger.info("Fetching real historic weather data...")
        try:
            raw = await fetch_all_cities_data(days=730)
            if not raw.empty:
                real_df = engineer_features(raw)
                logger.info("Got %d real data rows", len(real_df))
        except Exception as e:
            logger.warning("Real data fetch failed: %s — using synthetic only", e)

    for dtype in DISASTER_FEATURES:
        logger.info("Training XGBoost for: %s", dtype)
        try:
            if dtype == "flood"         and real_df is not None: df = _build_flood_df(real_df)
            elif dtype == "heatwave"    and real_df is not None: df = _build_heatwave_df(real_df)
            elif dtype == "air_quality" and real_df is not None: df = _build_air_quality_df(real_df)
            else: df = _generate_earthquake_data()

            if len(df) < 3000:
                syn = _generate_synthetic(dtype, n=3000)
                df  = pd.concat([df, syn], ignore_index=True)

            features = [f for f in DISASTER_FEATURES[dtype] if f in df.columns]
            X = df[features].values
            y = le.transform(df["risk_level"].values)

            X_tr, X_te, y_tr, y_te = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y)
            scaler  = StandardScaler()
            X_tr_sc = scaler.fit_transform(X_tr)
            X_te_sc = scaler.transform(X_te)

            model  = _train_xgboost(X_tr_sc, y_tr, X_te_sc, y_te)
            y_pred = model.predict(X_te_sc)
            acc    = accuracy_score(y_te, y_pred)

            joblib.dump(model,  os.path.join(MODEL_DIR, f"{dtype}_model.pkl"))
            joblib.dump(scaler, os.path.join(MODEL_DIR, f"{dtype}_scaler.pkl"))

            results[dtype] = {
                "accuracy":   round(acc * 100, 2),
                "samples":    len(df),
                "features":   features,
                "real_data":  real_df is not None and dtype != "earthquake",
                "trained_at": datetime.now().isoformat(),
            }
            logger.info("✅ %s: %.1f%% accuracy on %d samples", dtype, acc * 100, len(df))

        except Exception as e:
            logger.error("Failed to train %s: %s", dtype, e)
            results[dtype] = {"error": str(e)}

    joblib.dump(le, os.path.join(MODEL_DIR, "label_encoder.pkl"))

    with open(os.path.join(MODEL_DIR, "training_results.json"), "w") as f:
        json.dump(results, f, indent=2, default=str)

    logger.info("✅ All XGBoost models trained and saved.")
    return results


def predict_disaster(disaster_type: str, input_data: dict) -> dict:
    model_path = os.path.join(MODEL_DIR, f"{disaster_type}_model.pkl")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model for {disaster_type} not found. Run /retrain first.")

    model  = joblib.load(model_path)
    scaler = joblib.load(os.path.join(MODEL_DIR, f"{disaster_type}_scaler.pkl"))
    le     = joblib.load(os.path.join(MODEL_DIR, "label_encoder.pkl"))

    features  = DISASTER_FEATURES[disaster_type]
    X         = np.array([[input_data.get(f, 0) for f in features]])
    X_sc      = scaler.transform(X)
    pred_idx  = model.predict(X_sc)[0]
    proba     = model.predict_proba(X_sc)[0]
    risk      = le.inverse_transform([pred_idx])[0]
    prob_dict = {le.inverse_transform([i])[0]: round(float(p) * 100, 1)
                 for i, p in enumerate(proba)}

    return {
        "disaster_type":     disaster_type,
        "risk_level":        risk,
        "probability":       prob_dict[risk],
        "all_probabilities": prob_dict,
    }


if __name__ == "__main__":
    asyncio.run(train_all_models(use_real_data=True))    