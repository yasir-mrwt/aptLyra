"""Cloud STT. A provider failure is an error, never an empty candidate answer."""
import os
import requests
from fastapi import UploadFile, HTTPException

MAX_AUDIO_BYTES = 10 * 1024 * 1024

class WhisperService:
    model = True

    def load_model(self):
        pass

    def _call_groq(self, audio_bytes: bytes, filename: str) -> str:
        from app.services.groq_service import get_current_api_key, rotate_api_key, parse_retry_seconds
        if not audio_bytes:
            raise HTTPException(422, "Audio is empty. Please record again.")
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio exceeds the 10 MiB limit.")
        key = get_current_api_key()
        if not key:
            raise HTTPException(503, "Transcription is unavailable. Please retry later.")
        def send(api_key):
            return requests.post("https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (filename, audio_bytes)},
                data={"model": "whisper-large-v3-turbo", "response_format": "json",
                      "prompt": "um, uh, ah, ahh, hmm, like, you know"},
                timeout=(5, 60), allow_redirects=False)
        try:
            response = send(key)
            if response.status_code == 429:
                rotated = rotate_api_key(key, parse_retry_seconds(response.text) or 90)
                if rotated != key:
                    response = send(rotated)
            response.raise_for_status()
            payload = response.json()
            text = payload.get("text") if isinstance(payload, dict) else None
            if not isinstance(text, str):
                raise ValueError("Invalid transcription response")
        except (requests.RequestException, ValueError, TypeError):
            raise HTTPException(502, "Transcription failed. Please retry.") from None
        if not text.strip():
            raise HTTPException(422, "No speech detected. Please record again.")
        return text.strip()

    def transcribe(self, file: UploadFile):
        return {"text": self._call_groq(file.file.read(MAX_AUDIO_BYTES + 1), file.filename or "audio.webm")}

    @classmethod
    def transcribe_audio(cls, file_path: str):
        with open(file_path, "rb") as audio:
            content = audio.read(MAX_AUDIO_BYTES + 1)
        return {"text": whisper_service._call_groq(content, os.path.basename(file_path))}

whisper_service = WhisperService()
