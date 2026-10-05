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
