"""Real application authentication, with no network calls or provider keys."""
from fastapi.testclient import TestClient
from main import create_app


def test_internal_api_key_rejection(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "fixture-internal-key")
    client = TestClient(create_app())
    for route, payload in [("/generate-questions", {}), ("/evaluate", {}), ("/speech/tts", {"text": "hello"})]:
        assert client.post(route, json=payload).status_code == 401
        assert client.post(route, json=payload, headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/health").status_code == 200


def test_missing_server_key_fails_closed(monkeypatch):
    monkeypatch.delenv("INTERNAL_API_KEY", raising=False)
    assert TestClient(create_app()).post("/generate-questions", json={}).status_code == 500
