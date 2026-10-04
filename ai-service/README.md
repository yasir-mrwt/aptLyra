# TechVera AI Service 🤖

The AI microservice backend for TechVera. This service specialized in handling heavy-duty AI tasks, including audio transcription and generative interview intelligence, while maintaining a minimal resource footprint.

## 🚀 Capabilities

- **🧠 Generative Intelligence**: Uses advanced system prompting to generate role-specific interview questions with strict JSON schema guarantees. Now integrates user resume text to create real-world, project-specific scenario questions.
- **🎙️ Cloud-Native Transcription**: Offloads verbal audio analysis to the blazing-fast Groq Whisper API, staying within strict RAM limits (under 512MB) of free-tier hosting.
- **🛡️ Security Guardrails**: Implements input sanitization and prompt-injection hardening to prevent malicious behavior through user-provided roles, resumes, or answers.
- **⚡ Async Execution**: Built with FastAPI for non-blocking processing of multiple parallel evaluation requests.
- **📄 Advanced Resume Parsing**: Integrates PyMuPDF for lightning-fast, highly accurate document extraction, powering the ATS scoring and cover letter generation tools.

## 🏗️ Tech Stack

- **FastAPI**: Asynchronous, high-performance Python framework.
- **HTTPX / Requests**: Direct REST API interactions with the Groq API (chat completions + Whisper transcription).
- **PyMuPDF & pdf2image**: High-speed, robust PDF processing and image conversion.
- **PyTesseract**: Optical Character Recognition (OCR) for scanned documents.
- **python-docx**: Parsing and extraction of Microsoft Word documents.
- **Uvicorn**: Production-grade ASGI server with worker-based scaling.
- **Pydantic**: Type-strict data validation for all API requests and responses.
- **Pytest & Ruff**: Integrated testing suite and high-speed rust-based code linting.

## 🛠️ Installation & Setup

### 1. Prerequisites
- **Python 3.11.x**
- (Recommended) **Virtual Environment**

### 2. Environment Setup
```bash
# Clone the repository and navigate to this directory
cd ai-service

# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configuration
Create a `.env` file in this directory based on `.env.example`:
```env
PORT=8000
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_API_KEY=your_groq_api_key_here
ALLOWED_ORIGINS=http://localhost:5000,http://localhost:5173
REQUEST_TIMEOUT=60
```

## 🏃 Running the Service

```bash
# Production run
uvicorn main:app --host 0.0.0.0 --port 8000

# Development with reload (Increases RAM usage)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 📡 API Endpoints (Core)

- `POST /api/v2/resume/process`: Parses uploaded PDFs and structurally extracts text and skills.
- `POST /api/v2/resume/analyze`: Scores a resume against ATS metrics and industry benchmarks.
- `POST /api/v2/resume/rewrite-bullet`: AI-rewrites a single resume bullet point for maximum impact.
- `POST /api/v2/resume/generate-cover-letter`: Generates a professional cover letter dynamically mapped to a job description.
- `POST /generate-questions`: Batch generation of technical/conceptual questions.
- `POST /evaluate`: Detailed scoring and feedback for a specific answer/code snippet.
- `POST /transcribe`: High-speed audio-to-text conversion via Groq Whisper API.

---

## 🔒 Optimization & Architecture
- **Lazy Loading**: Service components are initialized only when first called to preserve startup memory.
- **Stateless Design**: Allows the service to be horizontally scaled without sticky sessions.
- **JSON Mode**: Explicitly uses `response_mime_type: application/json` for deterministic AI responses.


## Stable baseline verification

Use the supported runtimes and commands in [SETUP.md](../SETUP.md#phase-1-verification). Contracts, state transitions, and known limits are documented in [ARCHITECTURE.md](../ARCHITECTURE.md) and [SECURITY.md](../SECURITY.md).
