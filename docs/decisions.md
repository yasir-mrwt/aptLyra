# Architecture decisions

## Phase 1: stable baseline

- Keep Node 20.x (minimum 20.19; validated 20.20.2), Python 3.11 and the existing
  three-service stack. Use cloud inference; no GPU/model-download requirement.
  `file-type` 21.3.4 replaces 22 because 22 requires Node 22. Other dependency
  resolutions are preserved. npm synchronized stale root lockfile dependency/dev
  flags with the existing backend manifest; this does not change those versions.
- Retain `/transcribe` with a flat string response and use `/speech/analyze` for the
  runner. Provider failures are retryable processing errors. Missing ffmpeg means
  explicitly unavailable measurements, not guessed metrics.
- Use the existing shared internal key for both directions of resume communication.
  Bind callbacks to a configured backend origin and UUID path. Preserve Cloudinary
  whiteboards while rejecting general image URLs and private DNS destinations.
- Replace process-local interview mutexes with PostgreSQL transaction advisory locks.
  Persist completion rewards in the completion transaction; reserve follow-up capacity
  before provider work. Provider calls do not hold SQL locks.
- Keep Redis's question XP buffer and in-process interview/background resume tasks.
  Crash recovery, atomic Redis/SQL delivery, callback replay prevention and connection
  IP pinning are documented limitations, not claims of distributed exactly-once work.
- Keep Ava's identity and layout. Integrate functional loading/error/retry/listening/
  mute/completion behavior now; defer visual consistency, accessibility polish,
  responsive redesign, 3D avatars and bundle-performance work.
- Use localhost-only disposable Docker stores and deterministic provider fixtures.
  Real datastore verification is separate from live-provider or AI-quality verification.
- Stop after Phase 1. Knowledge storage, pgvector/RAG, recent-interview intelligence,
  planner/rubric changes, evaluator-confidence calibration and provenance remain future work.

## Phase 2: scope and final architecture

Status: **PLANNED FOR LATER PHASE**. These decisions freeze the design; Phase 2
implements documentation only. The baseline above remains **CURRENTLY IMPLEMENTED**.

| Decision | Rationale / consequence |
|---|---|
| Focus on junior Software Engineer, Backend Developer and Full Stack Developer; eight roots, English, Python/JavaScript benchmark and PostgreSQL SQL | A feasible FYP needs reviewed topic/score coverage. Existing broad catalogs remain legacy until functional setup integration; no specialist-role quality claim |
| Oral, coding and mixed core; company/resume modifiers and design-lite optional | Preserve existing useful tools while guaranteeing core practice without external company data or personal uploads |
| Express owns durable writes and filtered pgvector queries; FastAPI computes embeddings/plans/evidence/grades | Extend current repositories/auth/queue boundaries rather than introduce reference ORM/SQLite or duplicate session systems |
| PostgreSQL + pgvector only; Redis stores disposable cache/dispatch | Avoid a competing FAISS persistence layer; versioned content/model/dimension must agree and citations survive cache eviction |
| Immutable question/rubric/concept/evidence versions with relational authority, compatible session JSONB projections | Reproducible reports require stable lineage; legacy sessions must not acquire invented provenance |
| Deterministic persisted coverage/time plan and reviewed-seed fallback | Availability and provider failure should produce visible shortages, not uncontrolled generation or silent company/date filter relaxation |
| Separate technical score, delivery feedback and evaluator evidence confidence | Fluency is not correctness. Confidence is a gated evidence category, not an LLM probability or technical multiplier |
| Known rubric reviewed; generated/materially adapted rubric provisional, confidence capped at medium | Retrieved text and generated expectations alone do not establish authoritative grading; no evidence means withheld score |
| Reviewed original scores only in overall, with minimum coverage; probes/provisional scores shown separately | Avoid double-counting follow-ups, treating failures as zero, or inflating coverage from uncertain grading |
| Permitted versioned source adapters and review; recent interview occurrence within 180 days | Fetch time does not prove recency or permission. Voluntary experiences inform selection, not sole technical ground truth |
| Durable operation records, transactional outbox, leases and stale-result checks for later integration | Phase 1 transaction locks prevent cooperating write races, but do not recover in-process work or guarantee Redis/SQL reward delivery |
| SVG Ava, truthful states, typed alternative and functional UI in each feature phase | Backend intelligence must be usable as it ships. Phase 9 is cohesive polish; 3D/barge-in/hints remain deferred |
| Explicit consent/minimization/retention/deletion/provider disclosure required for FYP | Current controls cannot support a claim of complete erasure, zero provider retention or compliance certification |
| Held-out human judgments, failure scenarios and consented user study | Fixture passes establish contracts, not relevance/scoring quality; report measured limitations and confidence coverage |

Canonical details: [scope](final-scope.md), [taxonomy](competency-taxonomy.md),
[target contracts and ownership](target-architecture.md), [scoring/research](evaluation-design.md),
[privacy](data-and-privacy.md), and [phase boundaries](implementation-roadmap.md).
The recommended next step is Phase 3 knowledge schema, only on explicit authorization.

## Phase 3: migration and relational foundation

Status: **CURRENTLY IMPLEMENTED** storage; runtime intelligence is **PLANNED FOR
LATER PHASE**. Phase 2 remains the scope/design history above.

- Use ordered SQL and a compiled TypeScript runner with SHA-256 history, advisory
  locking, bounded SQL waits and one transaction per file. Forward-only release
  policy; a failed file/history rolls back and applied files cannot drift.
- Adopt identical baseline DDL as migration 001; preserve startup bootstrap.
  Knowledge migrations are an explicit local/release step; Docker ships SQL.
- Seed only the frozen 8 roots/24 children. No sources/questions/rubrics or invented
  legacy provenance. Normalize immutable document/question/rubric versions and links.
- Composite FKs enforce owned session and exact version relationships; the only
  baseline-table change is a session owner unique key. JSONB/public DTOs stay intact.
- Rubric children are built atomically in their creation transaction, then sealed.
  Require six anchored dimensions, valid technical weights and reviewed technical
  references; retirement cannot unlock mutations. No scoring algorithm is added.
- Store bounded evaluation dimensions/evidence and separate confidence/delivery,
  checking status/shape/range without computing scores or confidence gates.
- Add model-neutral embedding metadata only. Test PostgreSQL has no available
  vector extension; extension/dimension/index/model remain Phase 5 review work.
- Add owned operation/outbox/reward primitives without migrating dispatch, recovery
  or XP. Deletion tombstones and full privacy workflows remain future integration.
- Internal parameterized repositories only: no full admin APIs, FastAPI DB access,
  fake frontend controls or Ava redesign. No Phase 3 user-facing behavior change;
  schema is preparatory.
- Verify disposable PostgreSQL, adoption/history/failures, version/owner constraints
  and baseline regressions. CI adds a Linux PostgreSQL job; remote CI/production
  deployment is not claimed as locally verified.

Details: [database schema](database-schema.md) and [migration operations](migrations.md).
Stop after Phase 3; recommend only Phase 4.

## Phase 4: controlled local ingestion

Status: CURRENTLY IMPLEMENTED, independent of legacy interview execution.

- Extend backend/Phase 3 repositories with an OS/database-authorized internal CLI;
  no duplicate Python datastore, HTTP admin API or inline interview ingestion.
- Use exact canonical local paths plus approved input SHA-256 scopes; source config
  is trusted operator data, content cannot approve rights or assign reviewer IDs.
- Deterministic structured extraction avoids model/tool/injection privileges;
  Markdown is document-only. Read frozen taxonomy children from PostgreSQL.
- Screen before markup removal; discard flagged payloads and retain codes/hash;
  clean pending content expires after seven days and requires operator purge.
- Preserve exact/near duplicate links and explicit editorial decisions; bounded
  shingle comparison fails closed after 1,000 records rather than skipping checks.
- Keep occurrence separate from fetch/review; experiences always unverified selection
  evidence, explicit consent required, never technical-reference truth.
- Publish original 48-question seed only under Muhammad Yasir's exact review-packet
  approval and verified JSON binding. Separate actual human review from fixture tests.
- Add migration 004 without editing 001–003; no concepts/rubrics or scoring runtime.
- Defer HTTP/public submissions because their network/consent/moderation surfaces
  are not necessary for a safe reviewed local corpus.

No candidate-facing Phase 4 behavior; reviewed corpus is preparatory for Phase 5/6.
See [ingestion](ingestion.md), [policy](source-policy.md) and [manifest](corpus-manifest.md).
Stop after Phase 4. Recommend Phase 5 only once Phase 4 verification is complete.


## Phase 5: measured local embeddings and pgvector retrieval

- Chose pinned three-layer MiniLM ONNX, mean pooling / L2, 384d, after comparing
  real encoders on the approved seed and 32 fixed development queries. It matched
  top-five presence at smaller size and about half query CPU time; no statistical
  significance or held-out evaluation claim. See [model decision](embedding-model-selection.md).
- Preserve Express ownership of durable writes/filtering; FastAPI computes only.
  Add a forward 005 migration; preserve 001–004 checksums, legacy JSONB and deployed
  stack. Actual vectors link Phase 3 metadata to one atomically active generation.
- Use exact filtered cosine SQL for 48 entities, with bounded groups/hits and
  provenance-bearing deduplication. No ANN is justified for this corpus size.
  Defer Redis retrieval caching: no measured benefit has been established, and it
  cannot replace eligibility checks or audit writes. Compare measured total latency
  with the design target in the benchmark. A 1000-entity job budget fails closed
  pending scale measurement.
- Question-selection evidence is separate from reviewed technical ground truth;
  seed editorial notes are not technical references or reviewed rubrics. Missing
  technical grounding is explicitly no evidence, never invented.
- Persist query hashes and actual lineage/rank/reasons; revalidate availability
  and retire affected vectors on withdrawal, preserving historical audit. Do not
  implement planner fallback or personalize the shared index in Phase 5.
- Full-service mypy has 29 pre-existing errors in 10 files, reproduced at the
  committed Phase 4 baseline. New embedding modules/helpers pass scoped typing;
  unrelated legacy typing refactors are deferred and not claimed fixed.

No live interview behavior change in Phase 5; retrieval is ready for the Phase 6 planner.
Stop after Phase 5. Recommend only Phase 6 — Interview Planner.

## Phase 6 — Deterministic planner and legacy coexistence

Run deterministic-v1 allocation in Express, consuming existing Phase 5 retrieval instead of introducing a second planning service/store. Preserve reviewed content and real provenance, including strict company/date constraints. Approved fallback templates reference unchanged seed versions; no new generated questions or expanded human approval. Use additive migration 006, immutable relational UUID items and an owned session link. Preview persists only configuration/evidence; confirmation revalidates under editorial→session locks and projects questions into the legacy runner. Label legacy grading explicitly. Keep frozen estimates and honest reduced-count/difficulty warnings; bounded requests are not durable operations. Name-neutral planning components share the existing display profile. Preserve compatibility identifiers and all upstream/model attribution. Details: [planner](interview-planner.md). This records the Phase 6 boundary; the subsequently authorized Phase 7 decision is below.

## Phase 7 — Frozen grading policy and truthful review

Extend the Phase 3 relational foundation and Phase 6 locked session flow rather than create a parallel grader/store. The authorized Phase 7 prompt freezes five dimensions and 45/20/20/10/5 weights; it supersedes earlier proposals for authored weight overrides or non-applicable dimension omission. Express and SQL calculate/check the total; communication contributes zero weight. Reviewed aggregate retains the Phase 2 minimum-original/60%/root-coverage gates and excludes provisional, abstained, low-confidence, probe and legacy results.

Review binds the exact canonical immutable draft hash, question version and approved reference chunks to a genuine enabled human reviewer. Question-content approval is never rubric/reference approval. Generated concepts remain provisional; missing grading evidence abstains. Fixtures explicitly assume fictional review in disposable databases and do not demonstrate population accuracy. New confirmations opt into rubric-v1, preserving already-confirmed legacy policy. Runtime code evidence is exact hash/language matched and distinguishes execution from reviewed tests. Read projections suppress withdrawn evidence consistently across detail/list/analytics while historical audit records remain immutable. Reevaluation appends history without changing original reward/aggregate. [Operational contract](rubric-evaluation.md). Phase 8 has not started.

## Pre-Phase-8 product identity decision

The current product is Aptlyra and its interviewer is Lyra. Earlier phase names in this document are historical evidence. This focused rebrand preserves the React/Vite, Express, FastAPI, PostgreSQL and Redis architecture, corpus approvals, scoring policy and persisted identifiers. Hannah is the default English Orpheus voice, with environment overrides and browser fallback retained. Metadata and email public origins are operator configured. See [branding operations and audit](branding.md) and [voice audition](voice-audition.md). Phase 8 has not started.

## Phase 8 implementation decisions

- PostgreSQL operation/outbox records are the durable work list; existing Redis/BullMQ delivers stable operation IDs. No duplicate ORM/session architecture or new dependency was introduced. SQL leases, expected revisions and current ownership/editorial fences gate commit. Provider invocation can repeat after a crash; persisted grades/rewards cannot.
- One unfinished runtime operation per session simplifies answer/probe/report sequencing. Initial execution plus two transient retries are automatic; failure remains visible for a targeted manual retry/cancel. No-evidence abstention succeeds without invented score or provider substitution.
- Raw answers remain immutable; STT and grading pins are separate once-only checkpoints. Private bounded audio uses a shared persistent local/attached volume and SQL metadata, preserving the external-media architecture. A missing volume requires a new recording; it is not silently replaced.
- Grade, reward and probe reservation share one transaction. Immutable reports assemble committed original grade IDs and the frozen Phase 7 aggregate, then atomically complete/reward. No additional model or scoring-policy change is required for a report.
- Socket payloads contain safe revision/event/operation state only. REST is authoritative; reconnect, polling, stale-response guards and operation-specific UI controls recover the product flow. Historical legacy creation/execution/scoring and buffers remain compatible, rather than rewriting historical records.
- Package identities and disposable Compose project now use Aptlyra. Lockfile resolutions/legal/seed-review bytes are unchanged. The verified origin is Aptlyra; the local product folder remains `techvera/` under the user's direct edit boundary, with an exact final manual rename procedure documented. Phase 9 is not started.
