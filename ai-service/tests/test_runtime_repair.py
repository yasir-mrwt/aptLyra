"""Actual API boundaries with controlled provider responses, never external credentials."""
import io
import wave
import pytest
import requests
from fastapi.testclient import TestClient
from main import create_app
from app.services import groq_service as groq


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "runtime-fixture-key")
    monkeypatch.setattr(groq, "get_current_api_key", lambda: "provider-fixture-key")
    monkeypatch.setattr(groq, "rotate_api_key", lambda key, wait: key)
    monkeypatch.setattr(groq, "_wait_for_rate_limit", lambda: None)
    return TestClient(create_app(), headers={"X-API-Key": "runtime-fixture-key"})


class ProviderResponse:
    def __init__(self, status=200, code=None, content=b""):
        self.status_code = status
        self.ok = status == 200
        self.headers = {}
        self.content = content
        self.text = "private provider text must never be returned or logged"
        self.code = code

    def json(self):
        return {"error": {"code": self.code, "message": self.text}}


def wav():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b"\0\0" * 16)
    return buffer.getvalue()


def test_tts_terms_are_safe_unavailable_once(client, monkeypatch, caplog):
    calls = []
    def post(*args, **kwargs):
        calls.append(args)
        return ProviderResponse(400, "model_terms_required")
    monkeypatch.setattr(requests, "post", post)
    response = client.post("/speech/tts", json={"text": "Explain stacks"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "tts_terms_required"
    assert response.json()["detail"]["retryable"] is False
    assert len(calls) == 1
    assert "private provider text" not in response.text + caplog.text


@pytest.mark.parametrize("status,provider_code,code,expected", [
    (404, "model_not_found", "provider_model_unavailable", 503),
    (401, "invalid_api_key", "provider_authentication", 503),
    (403, "permission_denied", "provider_authentication", 503),
    (429, "rate_limit_exceeded", "provider_rate_limited", 429),
    (400, "invalid_request", "provider_unavailable", 502),
])
def test_tts_provider_errors_stay_safe(client, monkeypatch, status, provider_code, code, expected):
    monkeypatch.setattr(requests, "post", lambda *a, **k: ProviderResponse(status, provider_code))
    response = client.post("/speech/tts", json={"text": "Question"})
    assert response.status_code == expected
    assert response.json()["detail"]["code"] == code
    assert "private provider text" not in response.text


def test_chat_model_failure_has_readiness_code_and_no_score(client, monkeypatch, caplog):
    calls = []
    def post(*a, **k):
        calls.append(a)
        return ProviderResponse(404, "model_not_found")
    monkeypatch.setattr(requests, "post", post)
    response = client.post("/evaluate", json={"question": "Q", "question_type": "oral", "user_answer": "Answer"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "provider_model_unavailable"
    assert "technical_score" not in response.json()
    assert len(calls) == 1
    assert "private provider text" not in response.text + caplog.text


def test_tts_success_returns_actual_wav(client, monkeypatch):
    audio = wav()
    monkeypatch.setattr(requests, "post", lambda *a, **k: ProviderResponse(content=audio))
    response = client.post("/speech/tts", json={"text": "Question"})
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "audio/wav"
    assert response.content == audio


def test_lyra_voice_defaults_to_hannah_and_preserves_overrides(client, monkeypatch):
    monkeypatch.delenv("GROQ_TTS_VOICE", raising=False)
    monkeypatch.delenv("GROQ_TTS_MODEL", raising=False)
    calls = []
    def post(*args, **kwargs):
        calls.append(kwargs["json"])
        return ProviderResponse(content=wav())
    monkeypatch.setattr(requests, "post", post)
    assert client.post("/speech/tts", json={"text": "Welcome. I'm Lyra."}).status_code == 200
    assert calls[-1]["voice"] == "hannah"
    assert calls[-1]["model"] == "canopylabs/orpheus-v1-english"
    monkeypatch.setenv("GROQ_TTS_VOICE", "autumn")
    assert client.post("/speech/tts", json={"text": "Take your time."}).status_code == 200
    assert calls[-1]["voice"] == "autumn"


@pytest.mark.parametrize("content", [b"", b"not audio" * 10])
def test_provider_200_without_wav_is_failure(client, monkeypatch, content):
    monkeypatch.setattr(requests, "post", lambda *a, **k: ProviderResponse(content=content))
    response = client.post("/speech/tts", json={"text": "Question"})
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "invalid_provider_audio"


def test_tts_timeout_and_missing_key_stay_safe(client, monkeypatch):
    def timeout(*a, **k):
        raise requests.Timeout("private provider text")
    monkeypatch.setattr(requests, "post", timeout)
    response = client.post("/speech/tts", json={"text": "Question"})
    assert response.status_code == 504
    assert response.json()["detail"]["code"] == "provider_timeout"
    assert "private provider text" not in response.text
    monkeypatch.setattr(groq, "get_current_api_key", lambda: "")
    assert client.post("/speech/tts", json={"text": "Question"}).status_code == 503


def test_runtime_routes_remain_authenticated(client):
    assert client.post("/speech/tts", headers={"X-API-Key": "wrong"}, json={"text": "Question"}).status_code == 401
    assert client.post("/evaluate", headers={"X-API-Key": "wrong"}, json={"question": "Q", "question_type": "oral", "user_answer": "A"}).status_code == 401
