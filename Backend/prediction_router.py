from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from ml.disaster_model import predict_disaster, DISASTER_FEATURES

prediction_router = APIRouter(prefix="/predict", tags=["Disaster Prediction"])


class FloodInput(BaseModel):
    rainfall_mm:          float = Field(..., ge=0)
    humidity_pct:         float = Field(..., ge=0, le=100)
    temperature_c:        float = Field(...)
    wind_speed_kmh:       float = Field(..., ge=0)
    consecutive_rain_days: int  = Field(0, ge=0)
    rainfall_7day_sum:    float = Field(0.0, ge=0)
    humidity_7day_avg:    float = Field(50.0, ge=0, le=100)

class EarthquakeInput(BaseModel):
    seismic_activity:      float = Field(..., ge=0)
    ground_vibration:      float = Field(..., ge=0)
    historical_quakes_5yr: int   = Field(..., ge=0)
    fault_distance_km:     float = Field(..., ge=0)
    depth_km:              float = Field(..., ge=0)
    foreshock_count:       int   = Field(..., ge=0)

class HeatwaveInput(BaseModel):
    temperature_c:        float = Field(...)
    humidity_pct:         float = Field(..., ge=0, le=100)
    heat_index:           float = Field(...)
    consecutive_hot_days: int   = Field(0, ge=0)
    wind_speed_kmh:       float = Field(..., ge=0)
    temp_7day_avg:        float = Field(25.0)
    temp_max_7day:        float = Field(30.0)

class AirQualityInput(BaseModel):
    pm2_5:         float = Field(..., ge=0)
    pm10:          float = Field(..., ge=0)
    aqi:           float = Field(..., ge=0)
    temperature_c: float = Field(...)
    wind_speed_kmh:float = Field(..., ge=0)
    humidity_pct:  float = Field(..., ge=0, le=100)
    temp_7day_avg: float = Field(25.0)
    wind_7day_avg: float = Field(10.0)

class CombinedInput(BaseModel):
    # Shared
    temperature_c:         Optional[float] = 25.0
    humidity_pct:          Optional[float] = 50.0
    wind_speed_kmh:        Optional[float] = 10.0
    # Flood
    rainfall_mm:           Optional[float] = 0.0
    consecutive_rain_days: Optional[int]   = 0
    rainfall_7day_sum:     Optional[float] = 0.0
    humidity_7day_avg:     Optional[float] = 50.0
    # Earthquake
    seismic_activity:      Optional[float] = 0.2
    ground_vibration:      Optional[float] = 0.1
    historical_quakes_5yr: Optional[int]   = 0
    fault_distance_km:     Optional[float] = 100.0
    depth_km:              Optional[float] = 50.0
    foreshock_count:       Optional[int]   = 0
    # Heatwave
    heat_index:            Optional[float] = 25.0
    consecutive_hot_days:  Optional[int]   = 0
    temp_7day_avg:         Optional[float] = 25.0
    temp_max_7day:         Optional[float] = 30.0
    # Air quality
    pm2_5:                 Optional[float] = 20.0
    pm10:                  Optional[float] = 40.0
    aqi:                   Optional[float] = 40.0
    temp_7day_avg:         Optional[float] = 25.0
    wind_7day_avg:         Optional[float] = 10.0


@prediction_router.post("/flood")
async def predict_flood(data: FloodInput):
    try:
        return predict_disaster("flood", data.dict())
    except FileNotFoundError:
        raise HTTPException(404, "Flood model not found. Run POST /retrain first.")
    except Exception as e:
        raise HTTPException(500, str(e))

@prediction_router.post("/earthquake")
async def predict_earthquake(data: EarthquakeInput):
    try:
        return predict_disaster("earthquake", data.dict())
    except FileNotFoundError:
        raise HTTPException(404, "Earthquake model not found. Run POST /retrain first.")
    except Exception as e:
        raise HTTPException(500, str(e))

@prediction_router.post("/heatwave")
async def predict_heatwave(data: HeatwaveInput):
    try:
        return predict_disaster("heatwave", data.dict())
    except FileNotFoundError:
        raise HTTPException(404, "Heatwave model not found. Run POST /retrain first.")
    except Exception as e:
        raise HTTPException(500, str(e))

@prediction_router.post("/air_quality")
async def predict_air_quality(data: AirQualityInput):
    try:
        return predict_disaster("air_quality", data.dict())
    except FileNotFoundError:
        raise HTTPException(404, "Air quality model not found. Run POST /retrain first.")
    except Exception as e:
        raise HTTPException(500, str(e))

@prediction_router.post("/all")
async def predict_all(data: CombinedInput):
    d       = data.dict()
    results = {}
    for dtype in DISASTER_FEATURES:
        try:
            results[dtype] = predict_disaster(dtype, d)
        except Exception as e:
            results[dtype] = {"error": str(e)}
    level_order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    highest = max(results.values(),
                  key=lambda r: level_order.get(r.get("risk_level", "LOW"), 0))
    return {"overall_highest_risk": highest.get("risk_level"), "predictions": results}

@prediction_router.get("/features")
async def get_features():
    return DISASTER_FEATURES