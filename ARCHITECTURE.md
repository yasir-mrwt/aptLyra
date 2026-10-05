# TechVera architecture

## CURRENTLY IMPLEMENTED: Phase 1 baseline

The Phase 1 baseline preserves React 19/Vite/TypeScript, Express 5/TypeScript,
FastAPI/Pydantic, PostgreSQL, and Redis/BullMQ. Ava remains the existing SVG
interviewer with cloud TTS and browser voice fallback. There is no local GPU,
RAG, pgvector, research agent, or new scoring engine.

## CURRENTLY IMPLEMENTED: Phase 3 storage foundation

Phase 3 adds ordered/checksummed SQL migrations, the frozen taxonomy seed, and
preparatory relational knowledge/evidence/embedding-metadata/durability structures.
Internal typed repositories and PostgreSQL constraints protect ownership/version
integrity. Express owns writes; FastAPI has no database access. Current interviews
still use Phase 1 JSONB/scoring/background work. Startup verifies the old bootstrap;
knowledge migrations are explicit. No Phase 3 user-facing behavior change; schema
is preparatory. See [database schema](docs/database-schema.md) and
[migration operations](docs/migrations.md). No pgvector/model, ingestion, planner,
evaluator or durable executor is enabled.

## PLANNED FOR LATER PHASE: frozen FYP architecture

TechVera targets evidence-grounded preparation for final-year students and junior
software engineers (0–2 years). Oral, coding and mixed interviews are core;
company/resume focus and design-lite are optional. Eight junior competencies replace
unbounded role coverage in the target design. Technical performance, candidate
delivery feedback and evaluator confidence are separate outputs.

Express remains the owner of authentication, orchestration and PostgreSQL writes.
FastAPI computes validated AI results; later pgvector retrieval stays in PostgreSQL,
with Redis/BullMQ for jobs/caches. Versioned questions, rubrics, plans and evidence
supplement compatible legacy session JSONB at the schema level. Their runtime use
and durable operations/outbox recovery remain planned; current interviews do not use them.

| Design document | Purpose |
|---|---|
| [Final scope](docs/final-scope.md) | Users, modes, domain, exclusions and acceptance boundary |
| [Target architecture](docs/target-architecture.md) | Lifecycle, REST/Socket.IO, questions, data ownership, ingestion, retrieval, planner and Ava |
| [Competency taxonomy](docs/competency-taxonomy.md) | Eight roots, junior difficulty and observable evidence |
| [Evaluation design](docs/evaluation-design.md) | Reviewed/provisional rubrics, scoring, confidence, abstention and FYP research protocol |
| [Data and privacy](docs/data-and-privacy.md) | Current limits, required controls, retention/deletion and provider exposure |
| [Implementation roadmap](docs/implementation-roadmap.md) | Phases 3–12 and functional frontend work in each phase |
| [Decisions](docs/decisions.md) | Baseline and scope-freeze rationale |

Phase 2 was documentation only; Phase 3 implements the storage foundation above.
The remaining sections describe
**CURRENTLY IMPLEMENTED** baseline behavior, not the planned contracts above.

## Services and storage

| Component | Responsibility |
|---|---|
| `frontend/` | Redux state, interview setup, recorder, Ava, Monaco, Excalidraw, reports |
| `backend/` | Cookie authentication, ownership, lifecycle, SQL repositories, provider proxy, resume queue |
| `ai-service/` | Groq question/evaluation/follow-up calls, Whisper STT, TTS, resume parsing/analysis |
| PostgreSQL | Users, refresh tokens, sessions, resumes, gamification |
| Redis | BullMQ, result/view caches, OTP/reset state, question XP buffer |

Cloud deployment uses Neon PostgreSQL and Upstash Redis. Local verification uses
localhost-only PostgreSQL 16 and Redis 7 via `compose.test.yml`.

`config/db.ts` still bootstraps five tables using idempotent DDL and an existing
additive avatar-column update. The explicit migration runner adopts that identical
DDL with a forward-only policy. No new Phase 1 table/column was added.
`sessions.questions` remains JSONB. Optional
question fields are `processingError`, `speechMetricsStatus`, and `followUpPending`.
Older rows remain readable. Leaderboard queries use PostgreSQL's opted-in XP index.
Phase 3 adds only a redundant `(sessions.id,user_id)` unique key to support composite
owner foreign keys. No session column, historical JSONB or public DTO changes.

## Interview creation contract

`NewInterviewForm` → typed `CreateSessionRequest` → Express validation/controller →
`sessionService` → SQL repository and Node AI client → Python `QuestionRequest` →
generation prompt → persisted question array.

| Frontend/Node | Python | Rule |
|---|---|---|
| `role`, `level` | same | Nonempty setup selections |
| `interviewType` | `interview_type` | `oral-only`, `coding-mix`, `company-specific` |
| `count` | same | Integer 1–20 |
| `company` | same | Optional otherwise; required nonblank for company-specific; max 100 |
| `companyTrack` | `company_track` | Same rule as company |
| `resumeId` | owned resume → `resume_text` | Optional context |

Company/track selections are persisted even outside company-specific mode.
The existing form's `general` selection is a valid explicit value; no external
company research is performed.

Creation returns HTTP 201 `{message, sessionId, status: "processing"}` after
inserting `pending`. Background generation supplies company/track to the existing
prompt. The AI endpoint requires exactly the requested number of nonempty
question/ideal-answer pairs and the existing oral/coding/system-design enum.
Node validates this response before storing it. `QUESTIONS_READY` carries the
active session; `GENERATION_FAILED` carries a failed session for the retry/setup UI.

## Lifecycle and concurrency

| Operation | Allowed behavior |
|---|---|
| Generation | `pending → in-progress` or `pending → failed` |
| Submit answer | Only `in-progress`; strict index; rejects submitted/evaluated answers |
| Processing success | Stores validated evaluation; answer remains submitted/evaluated |
| Processing failure | Leaves session active; clears submitted flag; saves retry error; no fabricated score |
| Complete/end | `in-progress → completed`; rejects processing answers or reserved follow-ups |
| Repeat end | Returns existing completed session; preserves end time and XP |
| Cancelled/failed/pending | Reject answer/end operations |
| Delete | Rejects pending generation or processing/follow-up work; otherwise owned deletion |

All session JSONB read/modify/write cycles use `withSessionLock`, implemented with
PostgreSQL `pg_advisory_xact_lock` and a pooled transaction client carried through
`AsyncLocalStorage`. Locks coordinate cooperating API processes, not just one
Node process. AI/provider calls run outside the locks. Hash collisions only
serialize unrelated keys; direct SQL writers must obey the same lock convention.

Weak original answers below the existing technical-score threshold of 60 reserve
one of two session follow-up slots under the lock. Completed follow-ups plus
reserved slots count toward the limit. Generation and append recheck state; the
reservation is released on success or failure. A follow-up never gets its own probe.
These are existing follow-up rules, not a new adaptive interview policy.

Completion status, score summary, end time, completion XP, streak and badge updates
commit in one PostgreSQL transaction under session and user gamification locks.
The completed status is the idempotency claim; repeated end calls cannot award
completion XP again. Redis receives only question XP from the interview flow.
Concurrent XP flushes/streak writes use the user lock to avoid stale overwrites.

Background interview tasks still run in the API process. A process crash may leave
`pending`, `isSubmitted`, or `followUpPending` stranded; there is no durable
interview worker/recovery lease. Redis question XP and SQL cannot commit atomically:
a crash/SQL failure after Redis get/delete may lose buffered question XP. Completion
XP itself is direct SQL and rolls back with the session. These bounded durability
limits require a future recovery/outbox design, not extra intelligence features.

## Speech and evaluation contracts

`POST /transcribe` accepts multipart `file` and returns
`{"transcription": "candidate text"}`. It remains supported by the Node client.
The runner's active path is multipart `POST /speech/analyze` with `audio`:

```json
{
  "transcript": "candidate text",
  "metrics_status": "available",
  "metrics": {
    "duration_seconds": 10,
    "speaking_time_seconds": 8,
    "pause_time_seconds": 2,
    "pause_count": 1,
    "word_count": 4,
    "pace_wpm": 30,
    "filler_words_count": 1
  }
}
```

Both endpoints enforce nonempty audio and a 10 MiB limit. Missing provider
configuration returns 503; upstream failure or malformed STT response returns
502; empty recognized text returns 422. Requests have timeouts and never log
transcripts or provider authorization headers. Node propagates failure and releases
the answer for retry without invoking evaluation or awarding answer XP.

If ffmpeg is absent, fails, or exceeds its 30-second limit, valid text can still be
evaluated. The response has `metrics: null, metrics_status: "unavailable"`; no
synthetic duration, pace, pause or clarity score is persisted. Ava/UI explain this.

Evaluation requires a real oral answer or coding content. Scores must be finite
numbers between 0 and 100, with nonempty feedback and ideal answer. Invalid provider
output fails rather than becoming default zero scores. Existing scoring prompts,
equal-weight summary, and treatment of unevaluated questions as zero on manual end
remain unchanged. The existing `confidence_score` is model-generated answer feedback;
it is not calibrated evaluator confidence.

## Resume callbacks and remote images

The BullMQ process job dispatches `/resume/v2/process-async`, which returns HTTP
202, processes the file, and POSTs results to
`/api/resume/webhook/process-resume/:uuid`. That Node route verifies the existing
`X-API-Key` shared secret before touching a resume. Cached process results use the
same authenticated route and await acknowledgement. Successful callbacks persist
parsing and enqueue analysis; failed callbacks mark failed; malformed success is
rejected.

AI `RESUME_CALLBACK_BASE_URL` is an explicit trusted origin matching backend
`BACKEND_URL`. It has no path/query/credentials. Only the exact callback UUID path
on that origin is accepted, with redirects disabled and bounded timeouts. Local
HTTP/private destinations are intentionally allowed only through this configured
origin in development. Production uses HTTPS. Resume uploads are bounded at 10 MiB.

System-design remote downloads accept HTTPS Cloudinary `/image/upload/` PNG URLs
only. They reject credentials, unexpected ports/paths, private/non-global DNS
answers, redirects, oversized bodies, wrong MIME type, and missing PNG signature.
Connect/read timeouts and streaming size checks are applied. This narrows the
existing Cloudinary whiteboard flow; general remote image URLs are unsupported.
See [SECURITY.md](SECURITY.md) for remaining fetch and trust limits.

## Frontend and Ava

Audio uploads use UUID filenames to prevent collisions and preserve MIME-derived
extensions through the speech request, including browser MP4 recordings.
The recorder serializes microphone starts and waits for final `dataavailable` and
`onstop` before returning audio to submission. Drafts remain in IndexedDB; failed
diagram upload prevents submission so an incomplete answer is not silently graded.

Immediate request guards and server-submitted flags disable duplicate submission.
Retry errors unlock the affected answer. Pending retries clear stale error flags.
Completed sessions disable answer edits/recording/replay/finish actions; ending
failure leaves the runner able to retry. Failed generation links back to setup.

Ava labels ready, preparing voice, speaking, actual recording/listening, processing,
retry available, voice off, browser fallback, and completed. Voice playback is
cancelled during recording/processing/completion and stale asynchronous responses
cannot start playback. Mute remains in the existing local-storage key for compatibility.
The layout preserves the mobile column and desktop row behavior. Final visual,
accessibility and bundle-performance redesign work remains deferred.

## Verification

See [SETUP.md](SETUP.md#phase-1-verification) for mandatory local checks and
[docs/decisions.md](docs/decisions.md) for baseline decisions. Tests use deterministic
provider fixtures; PostgreSQL/Redis integration uses real disposable datastores.
They do not establish AI quality, live provider availability, or production readiness.
