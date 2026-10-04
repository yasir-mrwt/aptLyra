# 🛠️ TechVera — Local Setup Guide

Get all three services running on your machine in ~15 minutes.

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
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| Python | 3.10+ (3.14 works) | `python3 --version` |

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
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# AI service
cd ai-service
python3 -m venv .venv
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
