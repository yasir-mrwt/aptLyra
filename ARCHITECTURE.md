# Aptlyra architecture

This document records cumulative phase boundaries. The current Phase 8 runtime is described at the end and in [runtime/recovery](docs/runtime-recovery.md); earlier baseline behavior remains historical/legacy context.

## CURRENTLY IMPLEMENTED: Phase 1 baseline

The Phase 1 baseline preserves React 19/Vite/TypeScript, Express 5/TypeScript,
FastAPI/Pydantic, PostgreSQL, and Redis/BullMQ. The existing SVG interviewer is now Lyra
interviewer with cloud TTS and browser voice fallback. The live baseline has no retrieval integration, research agent or new scoring engine.
Phase 5 adds CPU semantic retrieval separately, described below; no local GPU is required.

## CURRENTLY IMPLEMENTED: Phase 3 storage foundation

Phase 3 adds ordered/checksummed SQL migrations, the frozen taxonomy seed, and
preparatory relational knowledge/evidence/embedding-metadata/durability structures.
Internal typed repositories and PostgreSQL constraints protect ownership/version
integrity. Express owns writes; FastAPI has no database access. Current interviews
still use Phase 1 JSONB/scoring/background work. Startup verifies the old bootstrap;
knowledge migrations are explicit. No Phase 3 user-facing behavior change; schema
is preparatory. See [database schema](docs/database-schema.md) and
[migration operations](docs/migrations.md). Phase 3 itself enabled no ingestion/model/retrieval execution; Phases 4–5 now add
editorial ingestion and internal retrieval. Phase 6 implements the planner; Phase 7 adds rubric evaluation below. Phase 8 now implements durable interview execution.

## PLANNED FOR LATER PHASE: frozen FYP architecture

Aptlyra targets evidence-grounded preparation for final-year students and junior
software engineers (0–2 years). Oral, coding and mixed interviews are core;
company/resume focus and design-lite are optional. Eight junior competencies replace
unbounded role coverage in the target design. Technical performance, candidate
delivery feedback and evaluator confidence are separate outputs.

Express remains the owner of authentication, orchestration and PostgreSQL writes.
FastAPI computes validated AI results; Phase 5 pgvector retrieval stays in PostgreSQL,
with Redis/BullMQ for jobs/caches. Versioned questions, rubrics, plans and evidence
supplement compatible legacy session JSONB. The Phase 8 runtime now executes SQL
operations/outbox recovery for planner-backed rubric interviews; the later sections
state its compatibility boundary.

| Design document | Purpose |
|---|---|
| [Final scope](docs/final-scope.md) | Users, modes, domain, exclusions and acceptance boundary |
| [Target architecture](docs/target-architecture.md) | Lifecycle, REST/Socket.IO, questions, data ownership, ingestion, retrieval, planner and Lyra |
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
| `frontend/` | Redux state, interview setup, recorder, Lyra, Monaco, Excalidraw, reports |
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

## Phase 4 — CURRENTLY IMPLEMENTED editorial imports

OS/database-authorized backend CLI → exact permitted local bytes → deterministic
quarantine/normalization/screening/dedupe/mapping → human review → Phase 3
versioned document/chunk/question publication. Migration 004 adds six import/review/
experience tables and append-only audit. The backend owns all writes; FastAPI and
candidate interview execution remain unchanged. No model extraction, HTTP ingestion,
public submissions, retrieval, embeddings, planner or scoring engine is introduced.

No candidate-facing Phase 4 behavior; reviewed corpus is preparatory for Phase 5/6.

See [ingestion](docs/ingestion.md), [source policy](docs/source-policy.md),
[reviewed corpus](docs/corpus-manifest.md) and [schema](docs/database-schema.md).


## Phase 5 retrieval — CURRENTLY IMPLEMENTED

The reviewed 48-question corpus now has an internal semantic retrieval path:
FastAPI computes pinned local CPU embeddings; Express controls generation/filtering
and PostgreSQL/pgvector owns vector storage, ranking and evidence. Migration 005
adds a 384-dimension vector table, staged/active generations and availability/
lineage guards without changing migrations 001–004 or legacy session execution.
Question and technical-reference channels are separate; current technical-reference
coverage is zero and is reported honestly. No shared candidate data is indexed.
See [retrieval](docs/retrieval.md), [model decision](docs/embedding-model-selection.md)
and [development benchmark](docs/retrieval-benchmark.md).

No live interview behavior change in Phase 5; retrieval is ready for the Phase 6 planner.

## CURRENTLY IMPLEMENTED: Phase 6 planner

The dashboard now uses deterministic Express planning over Phase 5 retrieval, owned persisted previews and explicit confirmation. Relational immutable plan/item/evidence snapshots link to sessions; confirmation projects server-selected originals into the existing JSONB runner. New setup is junior/scoped; old sessions and routes remain compatible. Previously confirmed sessions retain legacy evaluation. Phase 7 adds rubric scoring/confidence for newly confirmed sessions, as described below. This records the Phase 6 boundary; Phase 8 now supplies the durable runtime described below. See [planner](docs/interview-planner.md) for budgets, constraints, availability checks, frontend states and legal/compatibility audit.

## CURRENTLY IMPLEMENTED: Phase 7 evaluation

Fresh planner confirmations select `rubric-v1`; legacy sessions retain historical scoring. Express owns immutable draft/hash review, versioned concept/rubric/attempt/evaluation/evidence persistence, deterministic five-dimension scoring and reviewed original aggregation. FastAPI provides bounded strict computation, separate evidence confidence and abstention. Frontend runner, review, PDF and analytics distinguish reviewed/provisional/abstained/legacy. Coding uses exact-code JDoodle runtime facts with honest test limitations. Concept gaps may drive at most two nonrecursive provisional probes. Migration 007 extends the existing schema; no new database/model/queue architecture. See [implemented scoring and operator readiness](docs/rubric-evaluation.md). No human reference/rubric review is inferred from seed question approval; the configured corpus currently abstains. This records the Phase 7 boundary. Phase 8 now supplies durable recovery; research remains future approved work.

## Phase 8 durable execution — current implementation

The interview runtime now extends the Phase 3 SQL operation/outbox/reward foundations with migration 008 and the existing BullMQ dependency. Received claims precede STT; sealed extraction/pins, leased workers, startup reconciliation and revision/ownership/editorial fences protect graded results. Answer grade, SQL XP and probe reservation are atomic. Finishing queues an immutable report snapshot and commits completion/reward together; report failures recover separately. Socket events are safe REST-refresh hints; the runner/review recover after reconnect/reload and offer operation-specific retry/cancel. New confirmed plans and idle older real rubric plans on their next owned write use this runtime. Historical legacy execution/scoring remain compatible. Earlier in-process/Redis-buffer descriptions in the baseline sections describe the historical/legacy path. See [runtime and recovery](docs/runtime-recovery.md) for the exact boundary, audio shared-volume requirement and failure semantics. No dependency versions, reviewed content or scoring policy changed.
