"""
tts_engine.py  —  Text-to-Speech for Sahaay IVR
Uses gTTS (free, Indian English accent).
Falls back to pyttsx3 (fully offline) if no internet.
Audio stored in ivr/audio/ as WAV files.
"""

import logging
import subprocess
from pathlib import Path

log       = logging.getLogger("sahaay.tts")
AUDIO_DIR = Path("ivr/audio")
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def text_to_wav(text: str, filename: str) -> Path:
    """Convert text → WAV. Returns path. Caches result."""
    wav_path = AUDIO_DIR / f"{filename}.wav"
    if wav_path.exists():
        return wav_path

    mp3_path = AUDIO_DIR / f"{filename}.mp3"

    # gTTS works on all platforms (Linux/Windows/Mac)
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang="en", tld="co.in")
        tts.save(str(mp3_path))
        _mp3_to_wav(mp3_path, wav_path)
        log.info("TTS (gTTS): %s", wav_path.name)
        return wav_path
    except Exception as e:
        log.warning("gTTS failed (%s)", e)

    # pyttsx3 — Windows only, skip on Linux
    import platform
    if platform.system() == "Windows":
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.setProperty("rate", 145)
            engine.save_to_file(text, str(wav_path))
            engine.runAndWait()
            log.info("TTS (pyttsx3): %s", wav_path.name)
            return wav_path
        except Exception as e:
            log.warning("pyttsx3 failed (%s)", e)

    raise RuntimeError(f"TTS failed for '{filename}'")


def _mp3_to_wav(mp3: Path, wav: Path):
    """Convert mp3 → wav 8kHz mono using ffmpeg (required for phone audio)."""
    subprocess.run([
        "ffmpeg", "-y", "-i", str(mp3),
        "-ar", "8000", "-ac", "1",
        "-acodec", "pcm_s16le", str(wav)
    ], check=True, capture_output=True)
    mp3.unlink(missing_ok=True)


def play_wav(wav_path: Path):
    """Play WAV on PC speakers (for testing/monitoring only)."""
    try:
        from playsound import playsound
        playsound(str(wav_path.resolve()))
    except ImportError:
        # Fallback: Windows built-in
        try:
            import winsound
            winsound.PlaySound(str(wav_path), winsound.SND_FILENAME)
        except Exception as e:
            log.error("Playback error: %s", e)
    except Exception as e:
        log.error("playsound error: %s", e)


# ── All IVR prompt texts ──────────────────────────────────

PROMPTS = {
    "welcome": (
        "Welcome to SAHAAY emergency management system. "
        "Press 1 to report an emergency. "
        "Press 2 to hear the current disaster risk level. "
        "Press 0 to repeat this menu."
    ),
    "report": (
        "Your emergency has been received. "
        "Please stay calm and stay on the line. "
        "We are alerting rescue teams to your location immediately."
    ),
    "risk_low":      "Current disaster risk level is LOW. No immediate threat detected. Stay alert.",
    "risk_medium":   "Current disaster risk level is MEDIUM. Please stay alert and follow safety guidelines.",
    "risk_high":     "WARNING. Current disaster risk level is HIGH. Please move to safe ground immediately and await instructions.",
    "risk_critical": "CRITICAL ALERT. Immediate danger detected in your area. Evacuate immediately and call emergency services.",
    "alert_sos":     "SAHAAY EMERGENCY ALERT. A new SOS distress signal has been received. Rescue response is required immediately.",
    "alert_risk":    "SAHAAY ALERT. High disaster risk has been detected in your zone. Please respond and deploy rescue teams.",
    "press1":        "Press 1 to confirm you received this alert and are responding. Press 2 if you are unavailable.",
    "confirmed":     "Thank you. Your response has been recorded. Please proceed to the emergency zone immediately.",
    "unavailable":   "Understood. You have been marked as unavailable. We will contact another responder.",
    "no_response":   "No response received. You have been marked as not reachable. We will contact another responder.",
    "invalid":       "Invalid input. Please try again.",
    "thankyou":      "Thank you for calling SAHAAY. Help is on the way. Stay safe.",
    "connecting":    "Please hold. Connecting you to the SAHAAY emergency response system.",
}


def ensure_prompts():
    """Pre-generate all WAV prompts at startup. Safe to call multiple times."""
    log.info("🔊 Generating IVR audio prompts...")
    ok, failed = 0, 0
    for name, text in PROMPTS.items():
        try:
            text_to_wav(text, name)
            ok += 1
        except Exception as e:
            log.warning("Failed to generate prompt '%s': %s", name, e)
            failed += 1
    log.info("✅ IVR prompts ready: %d generated, %d failed", ok, failed)


def generate_dynamic_prompt(text: str, cache_key: str) -> Path:
    """Generate a dynamic TTS prompt (e.g. zone name, risk details)."""
    return text_to_wav(text, f"dynamic_{cache_key}")