import io
import socket
import pytest
import requests
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from main import create_app
from app.api import interview, speech
from app.api.v2 import resume
from app.services import fetch_security, groq_service
from app.services.whisper_service import whisper_service
from app.services.speech_analysis_service import SpeechAnalysisService


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "fixture-internal-key")
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.setenv("RESUME_CALLBACK_BASE_URL", "http://localhost:5000")
    return TestClient(create_app(), headers={"X-API-Key": "fixture-internal-key"})


def test_company_contract_and_prompt(client, monkeypatch):
    prompts = []
    def generate(system, prompt, **kwargs):
        prompts.append(prompt)
        return '{"questions":[{"question":"Explain indexes","ideal_answer":"A lookup structure","question_type":"oral"}]}'
    monkeypatch.setattr(interview, "call_groq", generate)
    body = {"role": "Backend", "level": "Junior", "count": 1, "interview_type": "company-specific"}
    assert client.post("/generate-questions", json=body).status_code == 422
    body.update(company="Acme", company_track="Platform")
    response = client.post("/generate-questions", json=body)
    assert response.status_code == 200
    assert response.json()["questions"][0]["question_type"] == "oral"
    assert "Acme" in prompts[0] and "Platform" in prompts[0]


@pytest.mark.parametrize("payload", ["null", "{}", '{"questions":[]}', '{"questions":[{"question":"Q","ideal_answer":"A","question_type":"invalid"}]}'])
def test_invalid_generation_is_not_success(client, monkeypatch, payload):
    monkeypatch.setattr(interview, "call_groq", lambda *a, **k: payload)
    assert client.post("/generate-questions", json={"count": 1}).status_code == 502


@pytest.mark.parametrize("score", [-1, 101, "bad", None])
def test_invalid_evaluation_is_not_a_score(client, monkeypatch, score):
    monkeypatch.setattr(interview, "call_groq", lambda *a, **k: "fixture")
    monkeypatch.setattr(interview, "parse_response", lambda text: {"technical_score": score, "confidence_score": 70, "ai_feedback": "feedback", "ideal_answer": "answer"})
    assert client.post("/evaluate", json={"question": "Q", "question_type": "oral", "user_answer": "Answer"}).status_code == 502


def test_evaluation_schema_and_missing_answer(client, monkeypatch):
    body = {"question": "Q", "question_type": "oral", "user_answer": "Answer"}
    monkeypatch.setattr(interview, "call_groq", lambda *a, **k: '{"technical_score":75,"confidence_score":60,"ai_feedback":"feedback","ideal_answer":"answer"}')
    response = client.post("/evaluate", json=body)
    assert response.status_code == 200 and response.json()["technical_score"] == 75
    body["user_answer"] = " "
    assert client.post("/evaluate", json=body).status_code == 422
    body["question_type"] = "unknown"
    assert client.post("/evaluate", json=body).status_code == 422


def test_transcribe_flat_contract(client, monkeypatch):
    monkeypatch.setattr(whisper_service, "_call_groq", lambda *args: "Candidate answer")
    response = client.post("/transcribe", files={"file": ("answer.webm", b"audio")})
    assert response.json() == {"transcription": "Candidate answer"}


@pytest.mark.parametrize("route,field", [("/transcribe", "file"), ("/speech/analyze", "audio")])
def test_empty_audio(client, route, field):
    assert client.post(route, files={field: ("answer.webm", b"")}).status_code == 422


@pytest.mark.parametrize("route,field", [("/transcribe", "file"), ("/speech/analyze", "audio")])
def test_stt_failure_propagates(client, monkeypatch, route, field):
    def fail(*args):
        raise HTTPException(502, "Transcription failed")
    monkeypatch.setattr(whisper_service, "_call_groq", fail)
    assert client.post(route, files={field: ("answer.webm", b"audio")}).status_code == 502


@pytest.mark.parametrize("text,expected", [("", 422), ({"nested": "text"}, 502), (None, 502)])
def test_whisper_invalid_response(monkeypatch, text, expected):
    monkeypatch.setattr(groq_service, "get_current_api_key", lambda: "fixture-provider-key")
    class Response:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {"text": text}
    monkeypatch.setattr(requests, "post", lambda *a, **k: Response())
    with pytest.raises(HTTPException) as error:
        whisper_service.transcribe(UploadFile(filename="a.webm", file=io.BytesIO(b"audio")))
    assert error.value.status_code == expected


def test_whisper_timeout_and_missing_provider(monkeypatch):
    monkeypatch.setattr(groq_service, "get_current_api_key", lambda: None)
    with pytest.raises(HTTPException) as error:
        whisper_service._call_groq(b"audio", "a.webm")
    assert error.value.status_code == 503
    monkeypatch.setattr(groq_service, "get_current_api_key", lambda: "fixture")
    def timeout(*args, **kwargs):
        assert kwargs["timeout"] == (5, 60) and kwargs["allow_redirects"] is False
        raise requests.Timeout()
    monkeypatch.setattr(requests, "post", timeout)
    with pytest.raises(HTTPException) as error:
        whisper_service._call_groq(b"audio", "a.webm")
    assert error.value.status_code == 502


def test_decoder_unavailable_does_not_fabricate_metrics(client, monkeypatch):
    monkeypatch.setattr(whisper_service, "_call_groq", lambda *a: "A valid spoken answer")
    def missing(*a, **k): raise FileNotFoundError()
    monkeypatch.setattr("subprocess.check_output", missing)
    response = client.post("/speech/analyze", files={"audio": ("a.webm", b"audio")})
    assert response.status_code == 200
    assert response.json() == {"transcript": "A valid spoken answer", "metrics": None, "metrics_status": "unavailable"}


def test_decoder_measurements(monkeypatch):
    monkeypatch.setattr("subprocess.check_output", lambda *a, **k: b"silence_duration: 2.0\ntime=00:00:10.00")
    data = SpeechAnalysisService.analyze_audio("fixture", "um a valid answer")
    assert data["duration_seconds"] == 10 and data["pause_time_seconds"] == 2
    assert data["filler_words_count"] == 1 and data["pace_wpm"] == 30


CALLBACK_PATH = "/api/resume/webhook/process-resume/12345678-1234-1234-1234-123456789abc"


@pytest.mark.parametrize("url", ["http://127.0.0.1:5000", "http://169.254.169.254", "https://example.com", "http://localhost:5000@evil.test", "http://localhost:5001"])
def test_callback_rejects_untrusted_origins(client, url):
    response = client.post("/resume/v2/process-async", data={"webhook_url": url + CALLBACK_PATH}, files={"file": ("r.txt", b"resume")})
    assert response.status_code == 422


def test_callback_accepted_and_authenticated(client, monkeypatch):
    sent = []
    monkeypatch.setattr(resume.ResumeOrchestratorService, "process_resume", lambda *a: {"success": True, "raw_text": "fixture"})
    class Response: status_code = 200
    def post(url, **kwargs): sent.append((url, kwargs)); return Response()
    monkeypatch.setattr(resume.requests, "post", post)
    response = client.post("/resume/v2/process-async", data={"webhook_url": "http://localhost:5000" + CALLBACK_PATH}, files={"file": ("r.txt", b"resume")})
    assert response.status_code == 202
    assert sent[0][1]["headers"] == {"X-API-Key": "fixture-internal-key"}
    assert sent[0][1]["allow_redirects"] is False


@pytest.mark.parametrize("url", ["http://127.0.0.1/a.png", "http://169.254.169.254/", "https://evil.test/a.png", "https://res.cloudinary.com@localhost/x", "https://res.cloudinary.com/demo/image/upload/../x.png"])
def test_unsafe_diagrams(client, monkeypatch, url):
    monkeypatch.setattr(requests, "get", lambda *a, **k: pytest.fail("Unsafe destination was fetched"))
    assert client.post("/evaluate", json={"question": "Q", "question_type": "system-design", "diagram_payload": url}).status_code == 422


def test_diagram_bounded_download(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("8.8.8.8", 443))])
    class Response:
        status_code = 200
        headers = {"Content-Type": "image/png"}
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def iter_content(self, size): yield b"\x89PNG\r\n\x1a\nfixture"
    def get(url, **kwargs):
        assert kwargs["stream"] and not kwargs["allow_redirects"] and kwargs["timeout"] == (5, 20)
        return Response()
    monkeypatch.setattr(requests, "get", get)
    url = "https://res.cloudinary.com/demo/image/upload/v1/diagram.png"
    assert fetch_security.fetch_diagram(url).startswith(b"\x89PNG")
    Response.headers["Content-Length"] = str(fetch_security.MAX_IMAGE_BYTES + 1)
    with pytest.raises(HTTPException): fetch_security.fetch_diagram(url)
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("127.0.0.1", 443))])
    with pytest.raises(HTTPException): fetch_security.fetch_diagram(url)


def test_callback_default_port_is_same_origin(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("RESUME_CALLBACK_BASE_URL", "https://backend.example.test:443")
    url = "https://backend.example.test" + CALLBACK_PATH
    assert fetch_security.validate_callback_url(url) == url
