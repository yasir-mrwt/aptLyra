# Interview planner

## Current behavior

The dashboard previews an owned persisted `planner-v1` plan before starting practice. Express runs the history-aware constraint planner; FastAPI supplies compatible embeddings. Confirmation projects pinned question versions into the existing runner. See [runtime recovery](runtime-recovery.md) and [rubric evaluation](rubric-evaluation.md) for current durable execution and scoring.

The bank includes the trusted 48-question starter path, human-approved practice questions, and questions with reviewed scoring. Practice questions no longer require a recent-trends opt-in or evidence/scoring guide. History policy and bounded randomized ties select among eligible questions; practice answers without a guide receive descriptive provisional feedback and do not contribute to reviewed aggregate scoring. Preview labels each item's inventory class. All root coverage, time, mode, difficulty, family and source constraints remain explicit.

## Inputs and validation

Roles: Software Engineer, Backend Developer, Full Stack Developer. Level: junior (0–2 years). English only. Select 1–4 distinct active roots in `junior-se-v1`: dsa, oop, dbms-sql, os, networks, backend-web, design-lite, programming. Request 3–10 originals (at least as many as selected roots), 15–60 minutes, easy/standard/stretch difficulty, oral/coding/mixed mode and Python/JavaScript coding language. SQL questions use SQL. Planned executable coding questions allow switching between Python and JavaScript; the current language is saved with the draft and committed answer. Both form and server validate; the server rejects unknown fields and arbitrary question IDs.

Modifiers are separate from mode. Company and valid occurrence-date bounds remain exact constraints in every stage. Capabilities list only eligible permitted dated reports; the current approved seed has none, so those form controls are unavailable. API requests with unavailable company/date evidence persist a visible non-confirmable shortage. Candidate changes to preferences create a new preview; there is no automatic relaxation. Resume/JD inputs are rejected rather than inferred. Design-lite permits at most one exercise, only in mixed mode. Existing untagged debugging questions remain spoken; executable debugging is not invented from category names.

## Retrieval and fallback

Each sorted root queries retrieval with role, taxonomy/root, category/mode, difficulty, company/date and expected model/corpus identity. Stages are requested difficulty, adjacent junior difficulty, trusted starter ranking, then approved dynamic practice. The duplicate approved-template stage is retired.

Healthy embeddings rank the exact trusted starter bank even when a broad root query has low or negative similarity: reviewed taxonomy and mode establish eligibility, while similarity orders eligible questions. This exception applies only to the hash-bound starter stage, never arbitrary dynamic content or technical grounding. A temporary semantic outage skips further model requests and dynamic lookup, selecting only `TRUSTED_BASELINE` through structured metadata with null similarity. The preview states the outage and fallback. Selected competencies, mode, difficulty preference, company/date constraints and duplicate prevention remain enforced.

Interview index completeness covers eligible trusted/approved interview inventory. An unclassified published import missing from the index cannot block all starters and cannot enter the plan. Eligible missing vectors and incompatible model generations still fail closed. General retrieval retains its complete-corpus checks.

The final `structured-practice` stage handles generic root queries whose similarity falls below the semantic threshold despite correct human-reviewed taxonomy. It is limited to dynamic approved inventory, preserves requested/adjacent difficulty and every other retrieval filter, excludes starter questions, and records `approved_practice_available` with null similarity. It runs only while semantic retrieval is available. It does not supply technical grounding or relax company/date constraints.

Retrieval operations are owned by the candidate/session and linked to the plan. Query text is not stored, only hashes. Item provenance comes from actual selected retrieval results; source quality and dates remain genuine editorial metadata. Provider errors are recorded as shortages; lack of an active compatible complete index is an error, not fabricated evidence. All sources and corpus identity are checked again under the editorial lock during persistence and confirmation. Withdrawn preview provenance is redacted on fresh reads. Confirmed runner reads redact unavailable originals; submission and speech reject those items. Historical persisted snapshots remain unchanged. A response already delivered cannot be recalled; complete stale-result/retention runtime work belongs to the later runtime phase.

General retrieval still returns five candidates from twenty duplicate groups. The internal owned planner pool considers all eligible rows up to 2,000 per stage, retaining duplicate variants until allocation so an early representative cannot discard a feasible difficulty/mode combination. Overflow fails closed instead of silently truncating. A 45-second elapsed-budget check occurs between retrieval calls; it is not hard cancellation of a running provider call. Browser preview timeout is 90 seconds. These are bounded requests in the API process, with no recovery/outbox guarantee.

## History-aware allocation

Every selected root must receive an original question. Roots are sorted; slots alternate round-robin. Exclude repeated question families and indexed duplicate groups. Fresh-first searches increasing repeat budgets, using an admissible remaining-fresh-capacity bound and memoized failed subsets. It minimizes repeats within the existing topic/difficulty/time allocation, rather than greedily sorting and accepting an avoidable repeat. Older, less frequent assignments break repeat ties; bounded random jitter breaks otherwise comparable choices. Revision uses elapsed days (capped at 90) weighted by reviewed weakness, with bounded jitter and fresh fallback. Every preview pins its selected order and reasons: reload never reshuffles a plan. New previews can differ.

Target requested difficulty count is `round(0.6 × effectiveCount)`, with the remainder adjacent: easy→standard, standard→easy, stretch→standard. For each proposed count, first search for that distribution, then an explicitly labeled difficulty shortfall. Reduce count from requested down to root count before sacrificing coverage. Search is bounded at 50,000 nodes; exhaustion is an explicit retry/error rather than an optimality claim. A mode/coverage failure or missing root yields a non-confirmable correction. Fresh-first and revision underfilled plans can be confirmed only if every requested root and core mode remain satisfied. Only-new underfilled plans are never confirmable; the requested count and filters remain unchanged. Mixed requires actual coding/SQL and spoken/design items. Design-lite never becomes an implicit core mode.

## Repetition choices and history

- **Fresh first** (default): maximize feasible unseen selections while preserving the existing allocation rules; disclose any necessary repeats.
- **Only new to me**: exclude all identities assigned in retained confirmed sessions before allocation. A shortage such as 2/3 disables confirmation and suggests changing competencies/difficulty, choosing Fresh first, or waiting for approved questions. A preview never consumes history.
- **Revision practice**: revisit older assignments, preferring valid reviewed weaknesses. Unanswered, abstained, legacy and provisional scores do not become technical weakness evidence. With insufficient compatible history, fresh items are labeled as fallback.

History is queried in batches for the authenticated user. Identity matches any stable question ID, trustworthy family key, indexed duplicate group (including keys pinned in past previews), or normalized exact question-text hash. Version changes therefore retain identity without treating an entire competency as a family. Historical pre-planner sessions use exact normalized text only. Unknown paraphrases without a known family/duplicate link cannot be inferred reliably.

A question is used once its plan is confirmed, including still-active sessions; answering is not required. Revision weakness requires a succeeded, medium/high-confidence evaluation against a known rubric with hash-bound human approval; latest revisions supersede earlier results. Other scores remain neutral. Retention follows existing session deletion: deleting history removes its repeat protection, which is disclosed in the form and preview.

The labeled native select sits below competencies, before Preview. Per-user tab drafts preserve unsent changes across reload/back; the latest persisted owned plan supplies the durable setup on another visit. Preview displays `New: N · Repeated: M` and marks repeated items. These counts describe selection-time history. The snapshot stores `selection.algorithmVersion=history-weighted-v1`, policy, counts, identity keys and reasons; public responses omit identity keys and priorities. The database’s existing `deterministic-v1` compatibility identifier remains unchanged because its invariant trigger requires it. No migration is needed.

Confirmation keeps the existing global editorial transaction lock followed by the session lock. This serializes competing confirmations across processes. Only-new rechecks both pinned and current identities against committed history inside that transaction; a conflicting second confirmation returns `repeat_history_changed` and requires a new preview. Duplicate confirmation returns the original session before consuming another assignment. Structured trusted-only fallback applies the same history policy.

## Time budget

| Item | Minutes |
|---|---:|
| Conceptual oral, scenario, spoken debugging | 3 |
| Coding | 8 |
| SQL | 5 |
| Design-lite | 8 |
| Setup/wrap-up | 2 |
| Probe reserve | 4 total |

Persist question minutes, overhead, total and slack; total must fit requested duration. For fresh-first/revision, count is reduced before dropping coverage. Only-new reports feasible counts but cannot confirm a reduced count. Impossible minimum coverage needs a setup change. These frozen estimates do not enforce a wall-clock deadline or change legacy follow-up behavior. The reserved four minutes is preparatory; no Phase 7/8 probe policy is added.

## Persistence and API

Migration 006 extends Phase 3 relational `interview_plans`/`plan_items` and adds an owned session link. Store setup snapshot, version/model-corpus identity, coverage, difficulty, requested/effective count and duration, shortages, time budget and revision/status. Items have UUID identity, zero-based display position, immutable question version, actual retrieval ID and provenance, category/difficulty/origin/reason/minutes; rubric and parent-probe fields remain nullable and unused. Array positions serve only the existing runner transport, not durable plan identity.

Database guards enforce immutable snapshots/items after creation, owned compatible selected evidence, actual provenance and current availability, coverage/count/difficulty/time agreement, contiguous ordering, mode/category constraints and family/group uniqueness. Creation runs in one transaction; confirmation uses editorial→session lock order. Old contracts remain outside new planner-specific guards. Migrations 001–005 are unchanged.

| Authenticated owned endpoint | Behavior |
|---|---|
| GET `/api/interview-plans/capabilities` | Supported modifiers, eligible company labels and the authenticated user’s latest saved setup |
| POST `/api/interview-plans/preview` | Strict setup; 201 persisted preview; no runnable questions before confirmation |
| GET `/api/interview-plans/:id` | Owned snapshot, metadata/coverage/time/shortages; no question text or answers |
| POST `/api/interview-plans/confirm` | `{planId, revision}` only; recheck compatibility/availability; atomically start linked session |

Cross-user IDs return 404. Authentication is the existing cookie middleware. Preview is limited to ten requests per fifteen minutes. Errors return safe codes/messages without private DB/provider details. Confirm increments revision once; retries at the original or confirmed revision return the same session. Stale unconfirmed plans must be previewed again. Deleting an owned draft/session cascades owned plans/evidence while preserving shared knowledge.

## Frontend and interviewer

Dashboard shows scoped setup; `/plans/:planId` reloads an owned preview. Coverage, effective count/time, distribution, fallback and unavailable evidence are shown before confirmation. No expected answers are exposed. Shortages requiring correction disable confirmation; reduced count/difficulty warnings remain explicit. Waiting reflects real network state with idle/preparing/plan-ready/transitioning/error-retry, disabled duplicate actions and retry paths. Navigation to `/interview/:sessionId` waits for successful server confirmation. Existing speaking/listening/evaluating states and SVG appearance remain.

Name-neutral `AIInterviewer`, `InterviewerState`, `InterviewerPanel`, `InterviewerAvatar` and existing voice hook share a central display profile. At the Phase 6 checkpoint the display name was Ava; the current identity is Lyra, as documented in [branding operations](branding.md). At that checkpoint direct character references were in the central profile, landing-page copy/demo hook/comments, welcome email copy and the legacy voice test description; the focused pre-Phase-8 rebrand now updates these names; visual character polish remains Phase 9. The landing demo's synthetic animation is still a demo, not planning progress.

## Branding and attribution

Historical Phase 6 branding snapshot: README then described TechVera, distinguishes current planning/legacy evaluation from planned scoring/runtime work, and omits outdated screenshots. Assets remain. Every remaining source occurrence of the upstream name is classified here:

| Location / retained text | Class | Reason |
|---|---|---|
| `render.yaml` two `preptalk-*` service names | B | Existing deployment resource identifiers; renaming requires a deployment migration |
| `backend/controllers/userController.ts` `preptalk/avatars` | B | Existing Cloudinary asset namespace; preserve uploaded asset compatibility |
| `frontend/src/hooks/useInterviewerVoice.ts` `preptalk_interviewer_muted` | B | Persisted mute preference; preserve user settings |
| `frontend/src/hooks/baseline.test.tsx` same key | D | Regression asserting historical preference compatibility |
| `THIRD_PARTY_NOTICES.md` upstream PrepTalk title | C | Honest upstream attribution; original MIT copyright and permission stay in LICENSE |
| This audit's exact retained identifiers/name | D | Maintenance record justifying compatibility, rather than product branding |

Ignored backend/frontend build outputs contain generated copies of the retained asset namespace/preference key. Ignored Ruff caches contain historical paths. These are local artifacts, not staged product branding; dependency/cache/Git history matches are not rewritten. License remains byte-identical. Existing backend MIT/Arnab Dey metadata and external model Apache-2.0 license/NOTICE remain intact. No TechVera-only ownership or new human corpus review is asserted.

## Validation and limitations

Planner tests use the real approved seed, PostgreSQL/pgvector, Redis, authentication and HTTP routes with a controlled embedding fixture. They verify pinned selection, repeat policies, exhaustive small-pool repeat optimality, strict confirmation races, per-user history, persistence/invariants, ownership, preview/confirm separation and idempotency, stale and withdrawn data, shortages, fallback, budgets and legacy coexistence. Frontend tests verify setup, pending/retry, warnings, states and confirmation navigation. Regression suites cover ingestion/seed, retrieval, schema, persistence and server smoke. CPU model checks are functional measurements, not held-out quality research. External voice/grading providers and browser microphone/whiteboard interaction are not certified by fixture tests. Corpus coverage remains small and uneven; reviewed rubrics/company reports/technical-reference coverage is zero.

Functional local check: the selected pinned CPU model embedded all 48 approved questions. Two identical mixed-mode previews selected the same five versions/reasons with 36 estimated minutes and explicit difficulty/fallback shortages; measured previews took 2.522 and 2.544 seconds in that run. Confirmation/retry was idempotent. These two samples are not a p95, held-out retrieval evaluation or provider grading measurement.

## Phase 6 preview repair

A complete corpus imported under a different source label previously lost seed/template fallback because the planner and structured strategy assumed one fixed registration key. Seed selection now binds to the Phase 4 approved corpus input SHA-256 and its published ingestion records/authorized authored adapter, while preserving every role/root/company/date/availability/vector/provenance check. Labels do not grant publication authority. Semantic thresholds and planner budgets remain unchanged. Generation/completeness preflight is read in one SQL snapshot, duplicate metadata is read once per hit batch and bounded candidate evidence is inserted in one statement; existing per-row lineage/ownership constraints and transaction rollback remain in force. These changes reduce remote database round trips that could otherwise exhaust the between-stage planning budget. Existing plans, generations and migrations 001–006 are untouched.
