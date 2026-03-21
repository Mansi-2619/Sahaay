"""
modem_bridge.py  —  Android ADB Call Controller
Controls Android phone via ADB to make and receive real phone calls.
Works on Windows with USB-connected Android (USB debugging enabled).
"""

import subprocess
import threading
import time
import logging
import re

log = logging.getLogger("sahaay.modem")


class AndroidModem:
    def __init__(self):
        self.active_call     = None
        self.on_incoming     = None   # callback(number: str)
        self.on_dtmf         = None   # callback(digit: str)
        self._monitoring     = False
        self._monitor_thread = None
        self._connected      = False

    # ── ADB helpers ──────────────────────────────────────

    def _adb(self, *args) -> str:
        cmd = ["adb", "shell"] + list(args)
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=10
            )
            return result.stdout.strip()
        except subprocess.TimeoutExpired:
            log.warning("ADB timeout: %s", args)
            return ""
        except FileNotFoundError:
            log.error("ADB not found. Install Android Platform Tools.")
            return ""
        except Exception as e:
            log.error("ADB error: %s", e)
            return ""

    def _adb_input(self, keycode: int):
        self._adb("input", "keyevent", str(keycode))

    def check_connected(self) -> bool:
        try:
            result = subprocess.run(
                ["adb", "devices"], capture_output=True, text=True, timeout=5
            )
            lines   = result.stdout.strip().split("\n")
            devices = [l for l in lines[1:] if "device" in l and "offline" not in l and "unauthorized" not in l]
            self._connected = bool(devices)
            if not self._connected:
                log.warning("No Android device found — IVR calls disabled until phone is connected")
            return self._connected
        except FileNotFoundError:
            log.error("ADB not found in PATH")
            return False
        except Exception as e:
            log.error("ADB check failed: %s", e)
            return False

    # ── Call control ─────────────────────────────────────

    def dial(self, number: str) -> bool:
        if not self.check_connected():
            log.warning("📵 Cannot dial %s — phone not connected", number)
            return False
        log.info("📞 Dialling %s via Android...", number)
        self._adb("am", "start", "-a", "android.intent.action.CALL", "-d", f"tel:{number}")
        self.active_call = number
        time.sleep(3)
        return True

    def hangup(self):
        log.info("📵 Hanging up...")
        self._adb_input(6)   # KEYCODE_ENDCALL
        self.active_call = None

    def answer(self):
        log.info("📲 Answering call...")
        self._adb_input(5)   # KEYCODE_CALL

    def send_dtmf(self, digit: str):
        dtmf_map = {
            "0": 7,  "1": 8,  "2": 9,  "3": 10,
            "4": 11, "5": 12, "6": 13, "7": 14,
            "8": 15, "9": 16, "*": 17, "#": 18,
        }
        keycode = dtmf_map.get(digit)
        if keycode:
            self._adb_input(keycode)

    def get_call_state(self) -> str:
        """Returns: IDLE | RINGING | OFFHOOK"""
        out   = self._adb("dumpsys", "telephony.registry")
        match = re.search(r"mCallState=(\d)", out)
        if match:
            state = int(match.group(1))
            return {0: "IDLE", 1: "RINGING", 2: "OFFHOOK"}.get(state, "IDLE")
        return "IDLE"

    def get_incoming_number(self) -> str | None:
        out   = self._adb("dumpsys", "telephony.registry")
        match = re.search(r"mCallIncomingNumber=(.+)", out)
        if match:
            num = match.group(1).strip()
            return num if num and num != "null" else None
        return None

    # ── Monitor loop ─────────────────────────────────────

    def start_monitor(self):
        self._monitoring     = True
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop, daemon=True
        )
        self._monitor_thread.start()
        log.info("📡 Android modem monitor started")

    def stop_monitor(self):
        self._monitoring = False

    def _monitor_loop(self):
        prev_state = "IDLE"
        while self._monitoring:
            try:
                if not self._connected:
                    # Re-check every 30s if phone disconnected
                    time.sleep(30)
                    self.check_connected()
                    continue

                state = self.get_call_state()

                if state == "RINGING" and prev_state == "IDLE":
                    number = self.get_incoming_number()
                    log.info("📲 Incoming call from %s", number)
                    if self.on_incoming:
                        self.on_incoming(number or "unknown")

                prev_state = state
                time.sleep(1)

            except Exception as e:
                log.error("Monitor error: %s", e)
                time.sleep(2)


# Global singleton
modem = AndroidModem()