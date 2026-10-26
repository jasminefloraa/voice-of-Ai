from __future__ import annotations

import base64
import io
import json
import math
import struct
import wave
from typing import Any

import httpx

try:
    from backend.app.config import settings
except ModuleNotFoundError:  # pragma: no cover - support backend-dir startup
    from app.config import settings


class SarvamClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.SARVAM_API_KEY
        self.base_url = (base_url or settings.SARVAM_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "api-subscription-key": self.api_key or "",
            "Content-Type": "application/json",
        }

    async def health_check(self) -> dict[str, Any]:
        if not self.api_key:
            return {"ok": False, "configured": False, "message": "SARVAM_API_KEY is not configured."}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(f"{self.base_url}/v1/models", headers={"api-subscription-key": self.api_key})
                if response.status_code in {200, 201, 202}:
                    return {"ok": True, "configured": True, "status_code": response.status_code}
                return {"ok": False, "configured": True, "status_code": response.status_code, "message": response.text[:250]}
        except Exception as exc:  # pragma: no cover - safety fallback
            return {"ok": False, "configured": True, "message": str(exc)}

    async def text_to_speech(self, text: str, language_code: str = "en-IN", speaker: str = "anushka") -> dict[str, Any]:
        if not self.api_key:
            raise ValueError("SARVAM_API_KEY is not configured.")
        payload = {
            "text": text,
            "language_code": language_code,
            "model": "bulbul:v4-flash",
            "speaker": speaker,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{self.base_url}/text-to-speech", headers=self._headers(), json=payload)
            if response.status_code >= 400:
                raise RuntimeError(f"TTS request failed: {response.status_code} {response.text[:250]}")
            body = response.json()
            audios = body.get("audios") or body.get("audio") or []
            if isinstance(audios, str):
                audios = [audios]
            if not isinstance(audios, list):
                audios = []
            combined = "".join(part.replace("\n", "").replace(" ", "") for part in audios if part)
            audio_bytes = base64.b64decode(combined) if combined else b""
            return {"audio_bytes": audio_bytes, "mime_type": body.get("mime_type", "audio/wav"), "raw_body": body}

    async def speech_to_text(self, audio_bytes: bytes, mode: str = "transcribe") -> dict[str, Any]:
        if not self.api_key:
            raise ValueError("SARVAM_API_KEY is not configured.")
        files = {"file": ("sample.wav", audio_bytes, "audio/wav")}
        data = {"model": "saaras:v4", "mode": mode}
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{self.base_url}/speech-to-text", headers={"api-subscription-key": self.api_key}, files=files, data=data)
            if response.status_code >= 400:
                raise RuntimeError(f"STT request failed: {response.status_code} {response.text[:250]}")
            body = response.json()
            transcript = body.get("transcript") or body.get("text") or ""
            return {"transcript": transcript, "raw_body": body}

    def create_demo_tts_audio(self, text: str) -> bytes:
        sample_rate = 22050
        duration_seconds = 0.75
        frequency = 220.0
        amplitude = 14000
        frames: list[bytes] = []

        for index in range(int(sample_rate * duration_seconds)):
            sample = int(amplitude * math.sin(2 * math.pi * frequency * index / sample_rate))
            frames.append(struct.pack("<h", sample))

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wave_file:
            wave_file.setnchannels(1)
            wave_file.setsampwidth(2)
            wave_file.setframerate(sample_rate)
            wave_file.writeframes(b"".join(frames))

        return buffer.getvalue()
