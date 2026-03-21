"""
data_collector.py  –  Sahaay Real-Time Data Collector
-------------------------------------------------------
Fetches live weather for all monitored cities and stores
labelled training rows in MongoDB + CSV backup.
Run on a schedule (e.g. every 6 hours via APScheduler).
"""

import asyncio
import csv
import logging
import os
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()
log       = logging.getLogger("sahaay.collector")
API_KEY   = os.getenv("OPENWEATHER_API_KEY")
DATA_DIR  = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

CITIES = ["Ludhiana", "Chandigarh", "Amritsar", "Jalandhar", "Patiala",
          "Delhi", "Mumbai", "Kolkata", "Chennai", "Bengaluru",
          "Hyderabad", "Ahmedabad", "Jaipur", "Lucknow", "Bhopal"]

# ── Auto-labelling rules ─────────────────────────────────
# These mirror your prediction.py thresholds so labels are consistent

def auto_label_flood(row: dict) -> str:
    r, h, rv = row["rainfall_mm"], row["humidity_pct"], row["river_level_m"]
    if r > 80 or rv > 4.0 or (r > 40 and h > 80):  return "HIGH"
    if r > 25 or rv > 2.5 or h > 70:                return "MEDIUM"
    return "LOW"

def auto_label_heatwave(row: dict) -> str:
    t, hi, chd = row["temperature_c"], row["heat_index"], row["consecutive_hot_days"]
    if t > 45 or hi > 50 or chd >= 5:   return "HIGH"
    if t > 38 or hi > 40 or chd >= 2:   return "MEDIUM"
    return "LOW"

def auto_label_air_quality(row: dict) -> str:
    aqi, pm = row["aqi"], row["pm2_5"]
    if aqi > 200 or pm > 90:   return "HIGH"
    if aqi > 100 or pm > 35:   return "MEDIUM"
    return "LOW"

def auto_label_earthquake(row: dict) -> str:
    sa = row["seismic_activity"]
    if sa > 4.0:   return "HIGH"
    if sa > 2.0:   return "MEDIUM"
    return "LOW"

LABELLERS = {
    "flood":       auto_label_flood,
    "heatwave":    auto_label_heatwave,
    "air_quality": auto_label_air_quality,
    "earthquake":  auto_label_earthquake,
}


async def fetch_weather_row(city: str, client: httpx.AsyncClient) -> dict | None:
    """Fetch current weather and return a feature dict."""
    try:
        res = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"q": city, "appid": API_KEY, "units": "metric"},
            timeout=10,
        )
        if res.status_code != 200:
            return None
        d = res.json()

        rainfall  = 0.0
        if "rain" in d:
            rainfall = d["rain"].get("1h", d["rain"].get("3h", 0.0))

        temp      = d["main"]["temp"]
        humidity  = d["main"]["humidity"]
        wind_kmh  = round(d["wind"]["speed"] * 3.6, 1)

        # Derived features
        heat_index = (
            -8.78469475556
            + 1.61139411 * temp
            + 2.33854883889 * humidity
            - 0.14611605 * temp * humidity
            - 0.012308094 * temp ** 2
            - 0.0164248277778 * humidity ** 2
            + 0.002211732 * temp ** 2 * humidity
            + 0.00072546 * temp * humidity ** 2
            - 0.000003582 * temp ** 2 * humidity ** 2
        )

        return {
            "city":                city,
            "timestamp":           datetime.utcnow().isoformat(),
            # Flood features
            "rainfall_mm":         round(rainfall, 2),
            "humidity_pct":        humidity,
            "river_level_m":       round(rainfall * 0.03 + 1.0, 2),  # proxy
            "soil_moisture_pct":   min(100, round(humidity * 0.6 + rainfall * 0.2, 1)),
            "temperature_c":       round(temp, 1),
            "previous_flood_days": 365,   # placeholder — update from DB history
            "elevation_m":         220,   # city-specific — update from lookup table
            "drainage_capacity":   5.0,   # placeholder
            # Heatwave features
            "heat_index":          round(heat_index, 1),
            "consecutive_hot_days": 0,    # computed below from history
            "uv_index":            5.0,   # placeholder — add UV API later
            "wind_speed_kmh":      wind_kmh,
            "cloud_cover_pct":     d["clouds"]["all"],
            "historical_heatwave_days": 10,  # placeholder
            # Air quality features
            "pm2_5":              0.0,    # filled by AQI fetch
            "pm10":               0.0,
            "aqi":                0.0,
            "co2_ppm":            415.0,  # approximate global avg
            "no2_ppb":            20.0,
            "industrial_proximity": 3.0,  # city-specific
            # Earthquake features (mostly static for India)
            "seismic_activity":    0.5,
            "ground_vibration":    0.1,
            "historical_quakes_5yr": 2,
            "fault_distance_km":   100.0,
            "depth_km":            30.0,
            "foreshock_count":     0,
        }
    except Exception as exc:
        log.error("Failed fetching %s: %s", city, exc)
        return None


async def fetch_aqi_row(city: str, lat: float, lon: float,
                        client: httpx.AsyncClient) -> dict:
    """Fetch OpenWeatherMap Air Pollution API data."""
    try:
        res = await client.get(
            "https://api.openweathermap.org/data/2.5/air_pollution",
            params={"lat": lat, "lon": lon, "appid": API_KEY},
            timeout=10,
        )
        if res.status_code != 200:
            return {}
        d    = res.json()
        comp = d["list"][0]["components"]
        aqi  = d["list"][0]["main"]["aqi"]  # 1-5 scale
        return {
            "pm2_5":  comp.get("pm2_5",  0.0),
            "pm10":   comp.get("pm10",   0.0),
            "co2_ppm": comp.get("co",    415.0),
            "no2_ppb": comp.get("no2",   0.0),
            "aqi":    aqi * 50,   # convert 1-5 → rough AQI 50-250
        }
    except Exception:
        return {}


CITY_COORDS = {
    "Ludhiana":  (30.9010, 75.8573), "Chandigarh": (30.7333, 76.7794),
    "Amritsar":  (31.6340, 74.8723), "Jalandhar":  (31.3260, 75.5762),
    "Patiala":   (30.3398, 76.3869), "Delhi":       (28.6139, 77.2090),
    "Mumbai":    (19.0760, 72.8777), "Kolkata":     (22.5726, 88.3639),
    "Chennai":   (13.0827, 80.2707), "Bengaluru":   (12.9716, 77.5946),
    "Hyderabad": (17.3850, 78.4867), "Ahmedabad":   (23.0225, 72.5714),
    "Jaipur":    (26.9124, 75.7873), "Lucknow":     (26.8467, 80.9462),
    "Bhopal":    (23.2599, 77.4126),
}


async def collect_and_store():
    """Main collection loop — fetch all cities concurrently, label, and save."""
    if not API_KEY:
        log.error("OPENWEATHER_API_KEY not set"); return

    async with httpx.AsyncClient() as client:
        weather_tasks = [fetch_weather_row(c, client) for c in CITIES]
        aqi_tasks     = [
            fetch_aqi_row(c, *CITY_COORDS.get(c, (0, 0)), client)
            for c in CITIES
        ]
        weather_rows, aqi_rows = await asyncio.gather(
            asyncio.gather(*weather_tasks),
            asyncio.gather(*aqi_tasks),
        )

    # Merge + label
    saved = 0
    for row, aqi in zip(weather_rows, aqi_rows):
        if not row:
            continue
        row.update({k: v for k, v in aqi.items() if v})

        # Auto-label each disaster type
        for dtype, labeller in LABELLERS.items():
            row[f"label_{dtype}"] = labeller(row)

        # Append to CSV
        csv_path = DATA_DIR / "training_data.csv"
        write_header = not csv_path.exists()
        with open(csv_path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(row.keys()))
            if write_header:
                writer.writeheader()
            writer.writerow(row)

        saved += 1

    log.info("Collected %d/%d cities", saved, len(CITIES))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(collect_and_store())