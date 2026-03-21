"""
weather.py  –  Sahaay Weather Service v3.0
Improvements:
  • Retries on transient errors (3 attempts, exponential back-off)
  • Returns feels_like, pressure, visibility, UV-friendly description
  • Raises structured exception instead of crashing on bad API key / city not found
  • Wind speed converted km/h (API returns m/s)
  • Timeout set explicitly
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("OPENWEATHER_API_KEY")


class WeatherError(Exception):
    pass


async def get_weather(city: str = "Ludhiana") -> dict:
    if not API_KEY:
        raise WeatherError("OPENWEATHER_API_KEY not set in .env")

    url    = "https://api.openweathermap.org/data/2.5/weather"
    params = {"q": city, "appid": API_KEY, "units": "metric"}

    last_error = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(url, params=params)

            if res.status_code == 401:
                raise WeatherError("Invalid OpenWeather API key")
            if res.status_code == 404:
                raise WeatherError(f"City not found: {city}")
            if res.status_code != 200:
                raise WeatherError(f"OpenWeather returned {res.status_code}")

            data = res.json()

            # Rainfall: try 1h bucket, fall back to 3h, default 0
            rainfall = 0.0
            if "rain" in data:
                rainfall = data["rain"].get("1h", data["rain"].get("3h", 0.0))

            # Wind: m/s → km/h
            wind_kmh = round(data["wind"]["speed"] * 3.6, 1)

            return {
                "city":        city,
                "temperature": round(data["main"]["temp"], 1),
                "feels_like":  round(data["main"]["feels_like"], 1),
                "humidity":    data["main"]["humidity"],
                "pressure":    data["main"]["pressure"],
                "rainfall":    round(rainfall, 2),
                "wind_speed":  wind_kmh,
                "wind_deg":    data["wind"].get("deg", 0),
                "visibility":  data.get("visibility", 10000),
                "description": data["weather"][0]["description"].title(),
                "icon":        data["weather"][0]["icon"],
            }

        except WeatherError:
            raise
        except Exception as e:
            last_error = e
            import asyncio
            await asyncio.sleep(0.5 * (attempt + 1))

    raise WeatherError(f"Failed after 3 attempts for {city}: {last_error}")