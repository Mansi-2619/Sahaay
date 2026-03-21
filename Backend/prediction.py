"""
prediction.py  –  Sahaay Risk Engine v3.0
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

RISK_LEVELS = [
    (75, "CRITICAL", "red",    "🔴"),
    (50, "HIGH",     "orange", "🟠"),
    (25, "MEDIUM",   "yellow", "🟡"),
    ( 0, "LOW",      "green",  "🟢"),
]

RAIN_TIERS = [
    (200, 100, "Catastrophic rainfall — severe flood risk"),
    (150,  85, "Extreme rainfall — flood warning"),
    (100,  65, "Heavy rainfall — localised flooding likely"),
    ( 80,  45, "Moderate-heavy rain"),
    ( 40,  20, "Light to moderate rain"),
    (  0,   0, None),
]

TEMP_TIERS = [
    (48, 100, "Extreme heatwave — life-threatening conditions"),
    (45,  80, "Severe heatwave alert"),
    (42,  55, "High temperature warning"),
    (40,  35, "Heat advisory in effect"),
    ( 5,   0, None),
    ( 2,  35, "Near-freezing temperatures — frost risk"),
    (-5,  65, "Sub-zero temperatures — severe cold warning"),
    (-99, 90, "Dangerous cold — hypothermia risk"),
]

WIND_TIERS = [
    (120, 100, "Hurricane-force winds — extreme danger"),
    ( 90,  80, "Violent storm winds — structural damage risk"),
    ( 70,  55, "Severe gale — dangerous conditions"),
    ( 60,  35, "Strong winds — travel disruption"),
    ( 45,  15, "Breezy — moderate wind advisory"),
    (  0,   0, None),
]

HUMIDITY_TIERS = [
    (95, 30, "Dangerously high humidity"),
    (85, 15, "Very high humidity"),
    (70,  5, "Elevated humidity"),
    ( 0,  0, None),
]

COMPOUND_RULES = [
    (lambda d: d["rainfall"] > 80  and d["humidity"] > 85,  1.30, "Rain + high humidity → flash flood risk amplified"),
    (lambda d: d["temperature"] > 40 and d["humidity"] > 70, 1.25, "Heat + humidity → heat index danger"),
    (lambda d: d["wind_speed"] > 60 and d["rainfall"] > 50,  1.20, "Storm winds + rain → severe storm conditions"),
    (lambda d: d["temperature"] > 42 and d["wind_speed"] > 40, 1.15, "Heat + wind → wildfire risk elevated"),
    (lambda d: d["rainfall"] > 100 and d["wind_speed"] > 70,  1.35, "Extreme rain + violent winds → cyclone-like conditions"),
]

ADVICE = {
    "CRITICAL": [
        "Evacuate low-lying and flood-prone areas immediately",
        "Activate all emergency response teams",
        "Issue public emergency broadcast",
        "Open all designated shelters",
    ],
    "HIGH": [
        "Alert rescue teams to standby",
        "Warn residents in vulnerable zones",
        "Monitor river and drainage levels closely",
        "Prepare emergency shelters",
    ],
    "MEDIUM": [
        "Monitor weather updates every 30 minutes",
        "Ensure emergency contacts are reachable",
        "Keep emergency kits ready",
    ],
    "LOW": [
        "Conditions are normal — continue routine monitoring",
    ],
}


@dataclass
class ScoreFactor:
    category: str
    score:    float
    label:    str
    weight:   float = 1.0

    @property
    def weighted(self) -> float:
        return self.score * self.weight


def _score_tiers(value: float, tiers: list) -> tuple[float, Optional[str]]:
    for threshold, score, label in tiers:
        if value >= threshold:
            return score, label
    return 0.0, None


def _compute_factors(temperature, rainfall, wind_speed, humidity) -> list[ScoreFactor]:
    factors = []
    rain_score, rain_label = _score_tiers(rainfall, RAIN_TIERS)
    if rain_score > 0:
        factors.append(ScoreFactor("Rainfall", rain_score, rain_label, weight=1.4))

    temp_score, temp_label = _score_tiers(temperature, TEMP_TIERS)
    if temp_score > 0:
        factors.append(ScoreFactor("Temperature", temp_score, temp_label, weight=1.2))

    wind_score, wind_label = _score_tiers(wind_speed, WIND_TIERS)
    if wind_score > 0:
        factors.append(ScoreFactor("Wind Speed", wind_score, wind_label, weight=1.1))

    hum_score, hum_label = _score_tiers(humidity, HUMIDITY_TIERS)
    if hum_score > 0:
        factors.append(ScoreFactor("Humidity", hum_score, hum_label, weight=0.6))

    return factors


def _apply_compounds(base_score: float, inputs: dict) -> tuple[float, list[str]]:
    multiplier, notes = 1.0, []
    for fn, mult, label in COMPOUND_RULES:
        if fn(inputs):
            multiplier = max(multiplier, mult)
            notes.append(label)
    return min(base_score * multiplier, 100.0), notes


def _resolve_level(score: float) -> tuple[str, str, str]:
    for threshold, level, color, emoji in RISK_LEVELS:
        if score >= threshold:
            return level, color, emoji
    return "LOW", "green", "🟢"


def predict_risk(temperature: float, rainfall: float,
                 wind_speed: float, humidity: float) -> dict:
    inputs  = dict(temperature=temperature, rainfall=rainfall,
                   wind_speed=wind_speed, humidity=humidity)
    factors = _compute_factors(temperature, rainfall, wind_speed, humidity)

    if factors:
        total_weight = sum(f.weight for f in factors)
        raw_score    = sum(f.weighted for f in factors) / total_weight
    else:
        raw_score = 0.0

    final_score, compound_notes = _apply_compounds(raw_score, inputs)
    risk_level, color, emoji    = _resolve_level(final_score)

    reasons = [f.label for f in factors if f.label] + compound_notes
    if not reasons:
        reasons = ["All conditions normal — no hazards detected"]

    confidence = "HIGH" if len(factors) >= 3 else "MEDIUM" if len(factors) == 2 else "LOW"

    return {
        "risk_level":  risk_level,
        "risk_score":  round(final_score, 1),
        "color":       color,
        "emoji":       emoji,
        "reasons":     reasons,
        "advice":      ADVICE[risk_level],
        "confidence":  confidence,
        "breakdown": [
            {"category": f.category, "score": round(f.score, 1),
             "weight": f.weight, "label": f.label}
            for f in factors
        ],
        "compound": compound_notes,
        "inputs":   inputs,
    }


# Quick test — run: python prediction.py
if __name__ == "__main__":
    tests = [
        ("Normal day",        dict(temperature=28, rainfall=5,   wind_speed=20, humidity=60)),
        ("Heavy rain",        dict(temperature=30, rainfall=85,  wind_speed=35, humidity=88)),
        ("Heatwave",          dict(temperature=46, rainfall=0,   wind_speed=15, humidity=30)),
        ("Severe storm",      dict(temperature=32, rainfall=160, wind_speed=95, humidity=92)),
        ("Compound disaster", dict(temperature=43, rainfall=180, wind_speed=110, humidity=95)),
    ]
    for name, kw in tests:
        r = predict_risk(**kw)
        print(f"\n{r['emoji']} {name}: {r['risk_level']} ({r['risk_score']}/100) | {'; '.join(r['reasons'])}")