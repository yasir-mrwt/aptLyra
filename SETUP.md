# 🛠️ Aptlyra — Local Setup Guide

Run the existing three-service stack on Node 20 and Python 3.11. No local GPU is required. Phase 5/6 CPU retrieval requires externally provisioned pinned model files, as described below.

For chat-model availability, TTS terms/browser fallback and retryable typed/recorded answers, see [Phase 6 runtime guidance](docs/runtime-repair.md). Historical example model selections may require account-specific access; verify them against Groq's active models before use. Embedding health alone does not establish evaluation or voice readiness.

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
| **Groq** | All AI — LLM, Whisper, Lyra's voice (TTS) | [console.groq.com](https://console.groq.com) |
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
EMAIL_FROM="Aptlyra <sender@example.test>"
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

# ── Lyra's voice ──
# One-time: accept the Orpheus terms at console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
GROQ_TTS_VOICE=hannah

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
# → {"message":"Aptlyra AI Microservice is running (Modular Version)"}
```

Open **http://localhost:5173** — register with email (OTP arrives in your inbox, or in the backend console if SMTP isn't set) or use Google Login.

---

## 5. Common issues

| Problem | Fix |
|---|---|
| `EADDRINUSE :::5001` | Something else owns the port — `lsof -tiTCP:5001 -sTCP:LISTEN \| xargs kill` |
| `EADDRINUSE :::5000` | macOS AirPlay owns 5000 — this project deliberately uses **5001** |
| First request takes ~5-10s | Neon free tier cold start — the backend retries automatically |
| Lyra speaks with a robotic voice | Accept the Orpheus TTS terms in the Groq Playground (with the key's account) |
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

## Phase 4 ingestion verification — CURRENTLY IMPLEMENTED

Use Node 20.x and the same disposable PostgreSQL 16 / Redis fixtures. External
store variables must be unset. With stores running:

```bash
npm --prefix backend run build
npm --prefix backend run test:schema
npm --prefix backend run test:ingestion
npm --prefix backend run test:seed
npm --prefix backend run corpus:seed-manifest
```

The schema/ingestion/seed scripts drop their own random databases afterward. The
seed script validates the actual approved review-packet and JSON hashes, exercises
real CLI publication with Muhammad Yasir's exact-scope review, verifies the manifest,
and drops the database; it is not a production import. Fixture editors are separate.
Run baseline `test:persistence` and `test:smoke`, then stop Compose. No keys or live
provider are needed. For deliberate private database imports, migrate explicitly
and follow [internal commands](docs/ingestion.md); register real reviewers and
review exact source contract/content hashes. Never run approval blindly. Production/
staging ingestion operations additionally require a final `--apply`.

No candidate-facing Phase 4 behavior; reviewed corpus is preparatory for Phase 5/6.


## Phase 5 local retrieval verification — CURRENTLY IMPLEMENTED

Requirements: supported Node 20.x, Docker, disposable ports 15432/15433/16379/18005,
and an absolute writable model cache **outside** the product repository. Use
Python 3.11 for native AI environments; Windows x64/macOS ARM64 wheels exist but
native performance was not verified. The measured configuration is Docker Linux
ARM64 on Apple M1. Existing Node dependencies/lockfiles are unchanged; Python adds
pinned ONNX Runtime/tokenizers/NumPy and their new transitive requirements.

Unix shell example (PowerShell: set the same external path with
`$env:EMBEDDING_TEST_MODEL_DIR`, adapting shell variable syntax):

```bash
export EMBEDDING_TEST_MODEL_DIR=/tmp/techvera-phase5-models/l3
docker compose -f compose.test.yml --profile embeddings build embeddings
docker compose -f compose.test.yml --profile embeddings run --rm --no-deps \
  -v "$EMBEDDING_TEST_MODEL_DIR:/models" embeddings \
  python prepare_embedding_model.py --directory /models
docker compose -f compose.test.yml --profile embeddings --profile without-vector \
  up -d --wait postgres redis embeddings postgres-without-vector
npm --prefix backend run build
npm --prefix backend run corpus:seed-manifest
npm --prefix backend run test:schema
npm --prefix backend run test:ingestion
npm --prefix backend run test:seed
npm --prefix backend run test:retrieval
npm --prefix backend run test:pgvector-unavailable
npm --prefix backend run retrieval:benchmark
npm --prefix backend run test:persistence
npm --prefix backend run test:smoke
docker compose -f compose.test.yml --profile embeddings --profile without-vector down
```

Unset `DATABASE_URL`, `NEON_DATABASE_URL`, `REDIS_URL` and `UPSTASH_REDIS_URL` before
verification: scripts reject external datastore configuration, create random local
DBs and drop them. The benchmark fixes its embedding URL to localhost and uses
Compose's disposable internal credential; it never imports into production.
Preparation explicitly downloads fixed-revision, hash-checked weights/tokenizer
and retains license/NOTICE outside Git. No download occurs during serving.
The benchmark writes only safe metrics to `/tmp`; product evidence artifacts do
not contain vectors, credentials or database dumps.

For authorized operator use against an intentionally selected database, apply
reviewed migrations with `npm --prefix backend run db:migrate`, publish only the
exact approved bytes using [ingestion](docs/ingestion.md), configure existing
`AI_SERVICE_URL` / `INTERNAL_API_KEY` and local AI `EMBEDDING_MODEL_DIR`, then:

```bash
npm --prefix backend run retrieval -- embed --dry-run
npm --prefix backend run retrieval -- embed
npm --prefix backend run retrieval -- questions "binary search progress" '{"competencies":["dsa"]}'
npm --prefix backend run retrieval -- references "reviewed technical explanation"
```

Production/staging commands additionally require deliberate `--apply`; no such
migration/import was run in Phase 5. Keep queries public in CLI arguments to avoid
shell-history disclosure. The internal service accepts typed objects for later
planner use; no candidate-facing endpoint/UI is exposed.

AI verification uses the existing checks profile, now with scoped embedding typing:

```bash
docker compose -f compose.test.yml --profile checks run --build --rm ai-checks
```

Equivalent scoped mypy covers the three embedding modules (and both new helpers
were checked locally). Full-service `mypy --ignore-missing-imports .` retains 29
errors in 10 older files, reproduced on committed Phase 4. Ruff critical checks and
all 54 AI tests pass; a pre-existing TestClient deprecation warning remains. Do not
claim full-service typing is clean. See [retrieval](docs/retrieval.md),
[model decision](docs/embedding-model-selection.md) and
[benchmark](docs/retrieval-benchmark.md).

No live interview behavior change in Phase 5; retrieval is ready for the Phase 6 planner.

## Phase 6 planner setup

Apply migrations through 006 explicitly, then use the Phase 4 exact-hash reviewed import and Phase 5 embedding CLI to obtain a complete active compatible corpus. Provision the pinned CPU model files outside Git, including their license/NOTICE; planning is unavailable without a compatible indexed corpus. No migration/import against production or staging was performed here. Existing provider configuration is still needed for voice and legacy answer evaluation.

For disposable verification: `docker compose -f compose.test.yml --profile without-vector up -d --wait postgres redis postgres-without-vector`, then backend `npm run test:planner` plus schema/ingestion/seed/retrieval/persistence/smoke suites. Tests refuse external datastore environment configuration and select localhost fixtures. The embeddings profile uses the external model cache for real model checks; it does not download or commit model files. Stop only these task fixtures afterward with the same Compose profiles.

Use the dashboard to configure junior practice, then review `/plans/:planId` and confirm. An underfilled preview explains shortages; impossible coverage or stale evidence requires a fresh preview. The current corpus has no company reports or reviewed rubrics; resume/JD is unavailable for this setup. Previously confirmed sessions retain legacy grading; new confirmations use Phase 7 rubric evaluation and may abstain until grading evidence is approved. See [planner operations/contracts](docs/interview-planner.md). Persisted deployment/asset/mute identifiers are intentionally retained; ordinary product presentation is Aptlyra.

## Phase 7 rubric readiness

Apply migration 007 explicitly and retain Node 20.19–20.x. Fresh planner confirmations use rubric evaluation; existing sessions stay legacy. Approved question content does not supply reviewed technical references or rubrics. With the current question-only seed, a typed answer is retained with low-confidence abstention and no absolute score. The [rubric operator workflow](docs/rubric-evaluation.md) covers private draft export, genuine exact-hash reference/rubric review, provisional practice, retirement and append-only reevaluation. Do not auto-approve generated content. Add `npm run test:evaluation` to the existing disposable `compose.test.yml` verification; destructive tests never use configured cloud stores. This describes the Phase 7 setup boundary; Phase 8 migration/worker setup is now described below.

## Aptlyra identity configuration

Set backend `PUBLIC_FRONTEND_URL` to the single public frontend origin for transactional links (otherwise the first `FRONTEND_URL` CORS origin is used). Set frontend `VITE_PUBLIC_URL` to that same origin when chosen; leave it blank locally to omit canonical/OG URLs. Rebuild the frontend after changes. No production domain is assumed. API, CORS, callback and Google OAuth settings remain environment/provider configured.

Use `GROQ_TTS_MODEL=canopylabs/orpheus-v1-english` and `GROQ_TTS_VOICE=hannah` for Lyra, after accepting provider terms. Existing private voice overrides win. See [voice audition](docs/voice-audition.md). All email templates use Aptlyra and the A monogram; `EMAIL_FROM` sets the mailbox, while the application normalizes its display name. See [branding operations](docs/branding.md) for sender-avatar actions and domain/remote migration steps.

## Phase 8 runtime installation and verification

Use Node 20.19–20.x and the existing Python 3.11 venv. Drain pre-upgrade in-process interview work and stop old API processes before a release; PostgreSQL cannot recover input that old code never stored. Build and apply the additive 008 migration explicitly from `backend/`:

```sh
npm run build
npm run db:migrate -- --apply
```

Never point destructive fixture tests at a configured/managed database. Start disposable PostgreSQL/pgvector and Redis with `docker compose -f compose.test.yml up -d --wait postgres redis` from the product root, then run all earlier checks plus `npm run test:durable` and `npm run test:e2e`. The Compose project is now `aptlyra-baseline`; database/user fixture identifiers remain compatible. If older `techvera-baseline` fixture containers occupy the ports, stop those exact disposable services before starting the renamed project. No dependency installation/upgrade is needed for this phase.

Start the normal backend after 008. It starts the interview worker and reconciles SQL intents automatically. Provide a persistent, private `INTERVIEW_MEDIA_DIR` shared by every API/worker process; the default is `uploads/interviews` relative to backend cwd. Keep it outside public serving. Typed answers require no media volume. Do not change the existing CORS/internal callback/auth settings or ignored environment files as part of runtime recovery. The intentional operator addition of `PUBLIC_FRONTEND_URL` remains preserved. See [runtime/recovery](docs/runtime-recovery.md) for retries, deadlines, finishing, deletion and diagnostics, and [branding](docs/branding.md) for verified remote/package identity and the deferred manual folder rename.
## Phase 8.5B source collection

Migration 010 is a reviewed forward-only schema change and is not auto-applied by the web server. Source registry actions require an enabled human reviewer linked to the authenticated account. Sources remain disabled until the operator records approval for the exact permission/configuration hash; changing permission-relevant scope clears that approval. The only network adapters are the bounded REST/JSON and RSS/Atom contracts. Do not treat robots.txt as permission or register a source without a verified permission basis. No real third-party source is currently enabled. Collector tests use deterministic local HTTP fixture servers; database persistence tests use only disposable `compose.test.yml` services. Run `npm run test:collectors`, `npm run test:planner-intelligence`, and then the complete backend/frontend/AI suites in [interview intelligence](docs/interview-intelligence.md).
