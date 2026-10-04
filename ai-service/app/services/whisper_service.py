import os
import logging
import requests
from fastapi import UploadFile

logger = logging.getLogger(__name__)

# Service to handle audio transcription.
# Migrated to Groq Whisper API for blazing fast and perfectly accurate
# verbatim transcription, replacing Gemini.

class WhisperService:
    def __init__(self):
        # We don't need to load heavy machine learning models locally anymore!
        self.model = True  # Compatibility flag

    def load_model(self):
        """No-op kept for backward compatibility with existing startup logic."""
        pass

    def _call_groq(self, audio_bytes: bytes, filename: str) -> str:
        from app.services.groq_service import get_current_api_key, rotate_api_key, parse_retry_seconds

        api_key = get_current_api_key()
        if not api_key:
            logger.error("GROQ_API_KEY is not set.")
            return ""

        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        files = {
            "file": (filename, audio_bytes)
        }
        data = {
            "model": "whisper-large-v3-turbo",
            "response_format": "json",
            "prompt": "um, uh, ah, ahh, hmm, like, you know"
        }

        try:
            response = requests.post(url, headers={"Authorization": f"Bearer {api_key}"}, files=files, data=data)

            # Rate limited → fail over once to the next configured key
            if response.status_code == 429:
                rotated = rotate_api_key(api_key, parse_retry_seconds(response.text) or 90)
                if rotated != api_key:
                    response = requests.post(url, headers={"Authorization": f"Bearer {rotated}"}, files=files, data=data)

            response.raise_for_status()
            text = response.json().get("text", "")
            logger.info(f"Groq Whisper Transcription: '{text}'")
            return text
        except Exception as e:
            logger.error(f"[CRITICAL] Groq Transcription error: {e}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(f"Response data: {e.response.text}")
            return ""

    def transcribe(self, file: UploadFile):
        """
        Sends audio data to Groq Whisper API for transcription.
        """
        try:
            audio_data = file.file.read()
            filename = file.filename if file.filename else "audio.webm"
            text = self._call_groq(audio_data, filename)
            return {"text": text.strip()}
        except Exception as e:
            logger.error(f"[CRITICAL] Transcription error: {e}")
            return {"text": ""}

    @classmethod
    def transcribe_audio(cls, file_path: str):
        """Synchronous helper for transcription from file path"""
        try:
            with open(file_path, "rb") as f:
                audio_data = f.read()
            filename = os.path.basename(file_path)
            
            # Use the global instance to make the call
            text = whisper_service._call_groq(audio_data, filename)
            return {"text": text.strip()}
        except Exception as e:
            logger.error(f"[CRITICAL] Transcription error from path: {e}")
            return {"text": ""}

whisper_service = WhisperService()
