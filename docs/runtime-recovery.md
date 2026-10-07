# Durable Aptlyra interview runtime — Phase 8

React/Vite, Express/TypeScript, FastAPI, PostgreSQL/pgvector and Redis/BullMQ remain the stack. Migration 008 extends the existing Phase 3 operation, outbox and reward tables. The API process starts the interview worker alongside the existing resume worker. PostgreSQL owns accepted work and committed results; Redis delivers operation IDs. No candidate text, rubric, audio or credentials enter queue jobs or socket envelopes.

## Acceptance and execution

Fresh confirmed plans use `aptlyra-runtime-v1`. An idle, existing `planner-v1` session using `rubric-v1` opts in on its next owned submit/finish. Migration and GET do not rewrite historical sessions. Pre-upgrade in-process work must drain before release; payloads that never reached durable storage cannot be reconstructed. Legacy scoring/session creation remain compatible and retain their earlier execution path.

An owned submit validates the current question/version/language and claims a received answer, operation and outbox intent in one session transaction. Recorded audio is first copied into private staging. Repeating the same question/payload returns the existing operation; changing an accepted payload requires cancelling failed processing or a new attempt after terminal failure. Only one unfinished runtime operation is accepted per session, including manual-retry failures. Navigation can change the displayed question while processing continues, but another answer/finish cannot discard accepted work.

The SQL publisher reconciles queued/due work on startup and every second, even when the outbox was previously published and Redis subsequently lost its job. BullMQ uses the operation UUID as its stable job ID. Publication occurs outside SQL locks and has a bounded wait. A worker claims a SQL lease/token and expected session revision, increments attempts and computes outside database locks. Default concurrency is two per process, bounded to four. Heartbeats extend a 30-second SQL lease, capped by a ten-minute operation deadline.

Commit rechecks the token, SQL lease/deadline, owner, session state/revision, plan item, question version, answer privacy and current editorial availability. The grade, JSONB read model, reward ledger/XP, operation result and successful outbox marker commit atomically. SQL/editorial/session locks protect the commit; no provider runs under them. Repeating a provider request after a crash is possible. A late or duplicate result cannot repeat a committed grade/reward.

## Answer trace and retry

Typed answers skip STT. Audio proceeds through received → transcribing → evaluating → evaluated/abstained. Raw submitted content is immutable. Transcription/speech facts and selected rubric/grounding/objective pins are each sealed once; evaluation retries reuse them. Input kind, plan lineage, follow-up index and content hash remain stable throughout retries. Failed processing creates no score.

Transient provider unavailability, timeout/rate limit and expired leases receive at most three attempts: the initial execution and two automatic retries. SQL schedules bounded exponential delay. Exhaustion or deadline becomes a visible manual-retry failure. Manual retry resets the automatic window on the same operation/attempt, records a manual-retry count and preserves total attempts. Authentication/model failures, invalid answer/provider output, unavailable media and stale/withdrawn/deleted work stop permanently. Unexpected report build/storage errors use a separate bounded report retry; ownership/revision fences remain terminal. A legitimate rubric/grounding abstention is a successful result; it is never automatically retried as failure or substituted with legacy scores.

Owned endpoints:

| Endpoint | Behavior |
| --- | --- |
| `POST /api/sessions/:id/submit-answer` | Existing multipart/typed contract; adds safe `operation` metadata |
| `GET /api/sessions/:id` | Existing `{message, session}` wrapper; adds revision, runtime state, safe operations and report metadata |
| `GET /api/sessions/:id/operations` | Owned safe state/attempt/error/retry metadata; no private payload/result |
| `POST /api/sessions/:id/operations/:operationId/retry` | Retry the saved failed operation; an already queued/running request is idempotent |
| `POST /api/sessions/:id/operations/:operationId/cancel` | Invalidate accepted answer/probe work explicitly; report work requires retry |
| `POST /api/sessions/:id/end` | Active → finishing with a durable report intent; repeated finishing/completed requests are safe |
| `DELETE /api/sessions/:id` | Owned private cascade, including active runtime work and staged media cleanup |

## Probes, reports and rewards

A scored original with a specific missing/partial/contradicted required concept can reserve one follow-up in the grade transaction. At most two reservations/probes exist per session and one per original. The stable reservation holds the parent evaluation, concept, source IDs and rationale. Generation failure retains it for retry; commit appends one question. Derived feedback stays provisional, never recursively probes, and never enters the reviewed-original aggregate.

Manual finish refuses accepted nonterminal answer/probe work. Failed work must be retried or explicitly cancelled first. Unsubmitted questions can remain unanswered. When every question is evaluated and no probe is pending, the runtime requests finishing automatically. Finishing locks answers and persists a report built deterministically from the committed evaluation IDs and frozen Phase 7 aggregate. No extra model is required to produce the report. A report error retries separately from successful answers. The report snapshot, completed status and completion reward commit together. Recovery resumes a queued/expired report after restart.

`interview_reports` retains immutable questions/feedback, scoring version, original evaluation IDs, summary and snapshot revision. Later reevaluation appends audit history without changing this snapshot or rewarding again. Current withdrawal/privacy rules still mask unavailable scoring evidence in public reads. Runner, history, review, analytics and PDF use the same public read model. Probes are identified separately. At least two eligible reviewed originals, 60% eligible coverage and coverage of every planned competency root remain required; insufficient coverage stays null.

Runtime answer rewards use `answer:<questionIndex>` and completion uses `completion` in the existing SQL ledger. Award amounts, leveling, streak and badge rules are unchanged. Ledger, gamification and denormalized user fields are in the result transaction. Clearing Redis cannot remove these awards. Historical legacy-only Redis question buffers remain a compatibility path; this does not retroactively turn old RAM/Redis-only work into durable records.

## Client recovery and privacy

Socket.IO emits only `{sessionId, revision, operationId, eventId, state, errorCode}` after committed changes. It is a refresh hint. The client ignores duplicate/older events, refreshes REST after reconnect/revision gaps, polls active/finishing runtime sessions every two seconds, and refreshes on browser focus/online. A disconnect/connection error displays a reconnecting message while REST recovery continues. Older REST responses cannot replace newer revisions. Retry targets the operation, queued/running answer/probe work can be explicitly cancelled, and completion navigation waits for authoritative completed state. Changing routes/accounts does not apply a previous interview's refresh. Owned deletion/not-found clears cached active state.

Audio uses `INTERVIEW_MEDIA_DIR`, default `uploads/interviews` relative to the backend working directory. Every API/worker must share a persistent private volume at this path. Files have generated names, private permissions, verified SHA-256/size and a 10 MiB bound. Supported formats remain webm/wav/mp3/ogg/m4a. Transcription removes the staged file after its SQL checkpoint; cancellation/deletion removes associated files. Pending/failed uploads expire after 24 hours, and a periodic sweep removes expired metadata and old unreferenced files. Upload-root startup cleanup does not traverse this directory. Without the shared volume, typed work still recovers, but lost audio becomes a safe terminal failure requiring a new recording. This is a staging guarantee, not an audio archive or full disaster-recovery claim.

Shutdown stops queue consumers, expires this process's SQL leases, closes Redis/PostgreSQL and leaves accepted intents for another process. Abrupt termination relies on lease expiry. Both require the same database, Redis queue namespace and media volume on restart. Never flush managed Redis or reset/reseed a configured database as a recovery procedure.

## Verification and operations

Run `npm run test:durable` and `npm run test:e2e` in addition to the existing suites against `compose.test.yml`. Their guards require disposable localhost stores. Tests use clearly fictional references/reviewers/provider outputs, real PostgreSQL/pgvector/Redis, separate worker processes, duplicate delivery, SIGKILL, Redis flush, failed publication, late leases, stale/deleted/withdrawn work and restart during finishing. Fixture vectors are deterministic computation, not a retrieval-quality measurement. No fabricated review is written to the configured manual database.

Useful operational counts do not require exporting private payloads:

```sql
SELECT operation_type, status, count(*) FROM durable_operations
WHERE runtime_version = 'aptlyra-runtime-v1'
GROUP BY operation_type, status;
SELECT count(*) FROM durable_operations
WHERE runtime_version = 'aptlyra-runtime-v1' AND status = 'running'
AND lease_expires_at <= now();
```

Apply 008 explicitly after disposable checks, then restart the normal backend. Do not edit applied 001–007, reset the corpus or auto-approve scoring content. The configured 48-question corpus has no reviewed technical references/rubrics and therefore truthfully abstains. Genuine content review is a separate operator requirement. Broader monitoring, backups, external-volume release arrangements and security hardening remain later approved work. Phase 9 is not started.
