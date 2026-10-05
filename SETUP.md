# 🛠️ TechVera — Local Setup Guide

Run the existing three-service stack on Node 20 and Python 3.11. No local GPU or model download is required.

Phase 3 adds an explicit migration step for the knowledge schema; it does not
change current interviews or run those migrations on web-server startup. See
[migrations](docs/migrations.md) and [database schema](docs/database-schema.md).
After privately configuring the intended backend database, run `npm run build`
then `npm run db:migrate` from `backend/`; a second invocation should apply nothing.
Production/staging requires a reviewed `npm run db:migrate -- --apply` release step.
No production migration was performed by Phase 3.

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  Frontend   │ ──▶ │   Backend    │ ──▶ │   AI Service   │
│ React+Vite  │     │  Express 5   │     │    FastAPI     │
│    :5173    │     │    :5001     │     │     :8000      │
└─────────────┘     └──────┬───────┘     └────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      Neon PostgreSQL            Upstash Redis
      (primary datastore)        (queues + caches)
```

---

## 1. Prerequisites

### Tools
| Tool | Version | Check |
|---|---|---|
| Node.js | 20.19+ within 20.x; validated 20.20.2 | `node -v` |
| npm | 10.x (bundled with Node 20) | `npm -v` |
| Python | 3.11.x | `python3.11 --version` |

Optional (recommended):
- `ffmpeg` — accurate speech-duration analytics → `brew install ffmpeg`
- `tesseract` + `poppler` — OCR for scanned/image-based resume PDFs → `brew install tesseract poppler`

### Free accounts you'll need
| Service | Used for | Get it at |
|---|---|---|
| **Neon** | PostgreSQL — primary database | [neon.tech](https://neon.tech) |
| **Upstash** | Redis — queues, caches, OTP store | [upstash.com](https://upstash.com) |
| **Groq** | All AI — LLM, Whisper, Ava's voice (TTS) | [console.groq.com](https://console.groq.com) |
| **Google Gemini** | Resume-analyzer fallback when Groq is rate-limited | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Google Cloud** | Google Login (OAuth) | [console.cloud.google.com](https://console.cloud.google.com) |
| **JDoodle** | Live code execution in interviews | [jdoodle.com](https://www.jdoodle.com) |
| **Cloudinary** | Whiteboard diagram + profile photo uploads | [cloudinary.com](https://cloudinary.com) |
| **Gmail App Password** | OTP / password-reset emails | Google Account → Security → App Passwords |

---

## 2. Clone & install

```bash
git clone <your-repo-url> techvera
cd techvera

# Backend
cd backend && npm ci && cd ..

# Frontend
cd frontend && npm ci && cd ..

# AI service
cd ai-service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

---

## 3. Environment files

### `backend/.env`

```env
# ── Core ──
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
JWT_SECRET=<any long random string>

# ── Data tier ──
# Neon console → Connection string (keep sslmode=require)
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
# Upstash console → "Redis Connect" → TCP/TLS URL (rediss://). The REST token works as the password.
UPSTASH_REDIS_URL=rediss://default:<token>@<host>.upstash.io:6379

# ── AI service link ──
AI_SERVICE_URL=http://localhost:8000
BACKEND_URL=http://localhost:5001
DATABASE_SSL=true
INTERNAL_API_KEY=<any long random string — must MATCH ai-service/.env>

# ── Google OAuth ──
GOOGLE_CLIENT_ID=<from Google Cloud console>
GOOGLE_CLIENT_SECRET=<from Google Cloud console>

# ── Integrations ──
JDOODLE_CLIENT_ID=<jdoodle>
JDOODLE_CLIENT_SECRET=<jdoodle>
CLOUDINARY_CLOUD_NAME=<cloudinary>
CLOUDINARY_API_KEY=<cloudinary>
CLOUDINARY_API_SECRET=<cloudinary>

# ── Email (OTP verification, password reset) ──
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=<your gmail>
SMTP_PASS=<16-char Gmail App Password, no spaces>
EMAIL_FROM="TechVera <your gmail>"
```

> No SMTP creds? Leave them empty — OTPs get printed to the backend console in development.

### `ai-service/.env`

```env
PORT=8000
NODE_ENV=development
RESUME_CALLBACK_BASE_URL=http://localhost:5001
ALLOWED_ORIGINS=http://localhost:5001,http://localhost:5173
REQUEST_TIMEOUT=60
INTERNAL_API_KEY=<same value as backend/.env>

# ── Groq (primary AI provider) ──
GROQ_API_KEY=gsk_...
# Optional failover keys. ⚠️ Extra keys only add quota if they're from
# DIFFERENT Groq accounts (different emails) — same-account keys share one quota.
GROQ_API_KEY_2=
GROQ_API_KEYS=
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_MIN_CALL_INTERVAL=1

# ── Ava's voice ──
# One-time: accept the Orpheus terms at console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
GROQ_TTS_VOICE=autumn

# ── Gemini — Resume Analyzer fallback ONLY ──
# Kicks in when ALL Groq keys are rate-limited. Voice + interviews stay on Groq.
GEMINI_API_KEY=<from aistudio.google.com/apikey>
GEMINI_MODEL=gemini-2.5-flash
```

### `frontend/.env`

```env
VITE_API_URL=http://localhost:5001/api
VITE_GOOGLE_CLIENT_ID=<same GOOGLE_CLIENT_ID as backend>
```

### Google OAuth configuration

In Google Cloud console → APIs & Services → Credentials → your OAuth 2.0 Client:

- **Authorized JavaScript origins:** `http://localhost:5173`
- **Authorized redirect URIs:** `http://localhost:5173`

(Changes take ~5 minutes to propagate.)

---

## 4. Run it (3 terminals)

```bash
# Terminal 1 — AI service → http://localhost:8000
cd ai-service && source .venv/bin/activate && uvicorn main:app --reload --port 8000

# Terminal 2 — Backend → http://localhost:5001
cd backend && npm run dev

# Terminal 3 — Frontend → http://localhost:5173
cd frontend && npm run dev
```

### Health checks

```bash
curl http://localhost:5001/health
# → {"status":"ok","db":"connected", ...}

curl http://localhost:8000/
# → {"message":"TechVera AI Microservice is running (Modular Version)"}
```

Open **http://localhost:5173** — register with email (OTP arrives in your inbox, or in the backend console if SMTP isn't set) or use Google Login.

---

## 5. Common issues

| Problem | Fix |
|---|---|
| `EADDRINUSE :::5001` | Something else owns the port — `lsof -tiTCP:5001 -sTCP:LISTEN \| xargs kill` |
| `EADDRINUSE :::5000` | macOS AirPlay owns 5000 — this project deliberately uses **5001** |
| First request takes ~5-10s | Neon free tier cold start — the backend retries automatically |
| Ava speaks with a robotic voice | Accept the Orpheus TTS terms in the Groq Playground (with the key's account) |
| Google popup `origin_mismatch` | Add `http://localhost:5173` to Authorized JavaScript origins |
| Redis `ECONNREFUSED` | Use the **TCP** `rediss://` URL from Upstash, not the REST URL |
| All Groq keys rate-limited | Resume analyzer falls back to Gemini automatically; interviews wait for the cooldown |

More in the [README troubleshooting table](./README.md#-troubleshooting).

Ready to go live? See **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## Phase 1 verification

Node 20.20.2 (minimum 20.19 within 20.x) and Python 3.11 are the supported baseline.
The checked-in `.nvmrc` and `.python-version` record these choices. On macOS with
an existing nvm installation, use `nvm install` then `nvm use` from the product root.
Install Python 3.11 with your existing runtime manager, or use the container below.

On Windows, install Node 20.x and Python 3.11 using your existing installer/manager,
then use PowerShell:

```powershell
cd ai-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python main.py
```

On macOS/Linux:

```bash
cd ai-service
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

For local resumes, set backend `BACKEND_URL=http://localhost:5001` and AI
`RESUME_CALLBACK_BASE_URL=http://localhost:5001`, `NODE_ENV=development`. Set backend
`PORT=5001`; both services must use the same real `INTERNAL_API_KEY`. Production
callback origins use HTTPS and AI `NODE_ENV=production`. Dummy Cloudinary values can
satisfy backend startup checks but cannot upload diagrams/photos. ffmpeg provides
measured speech metrics; without it transcript evaluation works with metrics
explicitly unavailable. Tesseract/poppler are required for scanned PDF OCR. The AI
Docker image includes all three tools; it uses Python 3.11 and needs no GPU.

Install exactly the Node lockfiles and run checks from the product root:

```bash
npm --prefix frontend ci
npm --prefix backend ci
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend test -- --runInBand
npm --prefix backend run build
```

Run Python checks from `ai-service/` in the activated Python 3.11 environment:

```bash
python -c "import main, requests, fitz, docx, pytesseract, pdf2image"
ruff check . --select E9,F63,F7,F82
python -m pytest tests -q
```

Alternatively, Docker Desktop provides the verified Python 3.11 environment
on both macOS Apple Silicon and Windows; run from the product root:

```bash
docker compose -f compose.test.yml --profile checks run --build --rm ai-checks
```

The check container mounts AI source read-only and disables source-directory caches.
It needs no keys. API/provider responses in the tests are deterministic fixtures.

For real persistence verification, start the disposable fixtures:

```bash
docker compose -f compose.test.yml up -d --wait postgres redis
npm --prefix backend run test:persistence
npm --prefix backend run test:smoke
docker compose -f compose.test.yml down
```

These services bind only `127.0.0.1:15432` and `127.0.0.1:16379`, with no persistent
volumes. PostgreSQL data uses tmpfs; Redis persistence is disabled. The plainly named
fixture password in Compose is disposable test data, never a production credential.
The integration runner rejects preexisting datastore environment variables and
sets only these local endpoints (`techvera_test`, Redis DB 15). It bypasses `.env`
loading in the AI client. In PowerShell, remove conflicting variables with
`Remove-Item Env:DATABASE_URL`, etc.; in a POSIX shell use `unset DATABASE_URL
NEON_DATABASE_URL REDIS_URL UPSTASH_REDIS_URL`. Do not point this suite at a cloud DB.
It inserts UUID-tagged fixture users and cleans their rows/buffer keys in teardown.
The script builds the backend automatically before checking schema bootstrap,
company/track persistence, ownership, real transaction locking/rollback, duplicate
answers, completion/reward idempotency, follow-up limits, STT failure state and Redis
buffer flushes. AI calls are fixtures even in this real datastore suite.

You may use the disposable local endpoints for development only if you understand
that stopping Compose destroys their contents. Set backend `DATABASE_SSL=false`
only for local PostgreSQL; production/staging always retain TLS. Clear the Upstash
URL when using `REDIS_URL` because Upstash takes precedence. Backend schema bootstrap
remains additive baseline DDL. The separate Phase 3 runner provides versioned
knowledge migrations; review production adoption/releases separately.

Large frontend chunk warnings and the existing dependency audit backlog are recorded
in [SECURITY.md](SECURITY.md). Do not treat mocked scoring tests as evidence of scoring
accuracy. Live Groq/Gemini/Cloudinary/email/code-runner verification requires locally
supplied credentials and is separate from these reproducible checks.

The smoke runner also rejects external datastore variables, boots the real Node 20
server on port 15001 with fixture integration settings, uses Redis DB 14, checks
SQL/Redis health plus user/callback authentication, and removes its temporary
upload directory. It makes no provider requests.

## Phase 3 schema verification

With the disposable Compose PostgreSQL running and external datastore variables
unset, run `npm run test:schema` from `backend/`. It builds automatically, creates
randomly named fixture-only databases, installs all migrations, repeats them,
checks history/rollback/CLI/version/ownership constraints and legacy compatibility,
then removes those databases. It does not load backend `.env` or contact providers.
The CLI subtest uses a temporary directory and explicit fixture configuration.
Run the Phase 1 lint/type/build/fixture and persistence/smoke checks as well.
Stop the disposable stores afterward with `docker compose -f compose.test.yml down`
from the product root. See [migration operations](docs/migrations.md) for full policy.
