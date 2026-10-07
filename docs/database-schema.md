# Database schema — Phase 3 foundation

## CURRENTLY IMPLEMENTED

The foundation migrations and a checksum-verified TypeScript runner adopt the
five existing tables, add 27 preparatory knowledge/evidence/durability tables and
seed `junior-se-v1` (8 roots, 24 children). `schema_migrations` is an additional
runner-owned history table. Express/backend repositories own all durable writes;
FastAPI has no PostgreSQL credentials or schema access. The current interview path
still writes legacy session JSONB and uses its existing scores/background work.

No Phase 3 user-facing behavior change; schema is preparatory.

The executable schema is [002_knowledge_foundation.sql](../backend/migrations/002_knowledge_foundation.sql);
the unchanged baseline is [001_legacy_baseline.sql](../backend/migrations/001_legacy_baseline.sql),
and the migration-only taxonomy seed is [003_junior_taxonomy.sql](../backend/migrations/003_junior_taxonomy.sql).
Migration history is created by [the runner](../backend/database/migrations.ts).
See [migration operations](migrations.md) before applying anything.

## Entity ownership and relationships

| Table | Purpose and durable relationships |
|---|---|
| `schema_migrations` | Applied filename/SHA-256/time; runner writes once per successful transaction |
| `taxonomy_versions` | Reviewed hierarchy release identity and active/deprecated lifecycle |
| `competencies` | Versioned stable root/child IDs, names/descriptions, parent, ordering, timestamps and deprecation |
| `sources` | Editorial source identity/type/origin, permission/license/terms evidence, attribution, review and enabled/suspended state |
| `source_documents` | Stable external identity scoped to a source |
| `source_document_versions` | Immutable published content/hash, separate occurrence/publication/fetch/review dates, rights/PII/confidentiality/quality and withdrawal |
| `source_chunks` | Versioned bounded excerpts/hash/chunker/offsets; source-version relation and retirement/redaction |
| `interview_questions` | Stable family identity and primary child competency |
| `question_versions` | Text/category/difficulty/origin/hash, primary taxonomy, adaptation base, generation metadata and publication/review snapshot |
| `question_version_competencies` | Secondary child tags from the same taxonomy |
| `question_provenance` | Real document-version/optional same-document chunk lineage and origin/grounding/editorial relationship |
| `rubrics` | Stable rubric identity for a question family |
| `rubric_versions` | Exact question version, known/provisional kind, reviewed/provisional/retired status, policy, reviewer/time and fatal-rule metadata |
| `rubric_dimensions` | Six dimension anchors/applicability/weights and technical vs delivery aggregation kind |
| `expected_concepts` | Stable keys/IDs within rubric version, importance/essential/critical flags, alternatives and observable anchors |
| `concept_references` | Reviewed permitted technical-reference chunks supporting each concept |
| `interview_plans` | Owned session/configuration, contract/planner/taxonomy/corpus versions, counts/duration/distribution/coverage/modifiers/budgets/shortages and revision |
| `plan_competencies` | Selected root IDs from the plan's taxonomy |
| `plan_items` | Stable ordered question/rubric selections, pinned category/difficulty/origin, retrieval reason, estimated time, parent probe and lifecycle |
| `retrieval_evidence` | Operation identity, optional owned session/plan, bounded redacted query/hash/filters, model/corpus/policy metadata, outcome and cache-hit flag |
| `retrieval_results` | Ranked question-version or chunk hits with bounded similarity and selection/exclusion reason |
| `answer_attempts` | Owned item/attempt identity, bounded text/code and media references, processing and redaction/deletion status |
| `evaluations` | Answer/question/rubric/policy pins, revision/supersession, status, nullable technical score, confidence/reasons, dimensions, separate delivery and model/prompt metadata |
| `evaluation_evidence` | Same-rubric concept judgment, answer span/test/artifact explanation and permitted concept-reference chunk |
| `embedding_metadata` | Question-version or chunk identity plus purpose/model/revision/dimension/normalization/hash/generation/status; no vector values |
| `durable_operations` | Owned stable/idempotent operation identity, status/attempts/lease/deadline/hash/revision/error; no executor |
| `transactional_outbox` | Owned session event/revision/bounded payload/publication attempts; no dispatcher |
| `reward_ledger` | Owned session/reward-key uniqueness and amount; no changes to existing XP delivery |

Global knowledge writes are internal editorial primitives; the internal Phase 4 CLI
uses OS/database-authorized operators and registered reviewers. Private writes take
an explicit caller owner. Composite foreign keys enforce ownership independently
of repository checks: plan→owned session, item→plan/session/user, answer→item and
question, evaluation→answer/rubric/question/policy, evidence→evaluation/concept/rubric.
Scope ownership is not delegated to an LLM. These checks supplement cookie auth
in owned APIs; Phase 3 added no routes, and Phase 6 now adds planner routes.

## Enforced structural rules

- Each competency key is `(taxonomy_version,id)`. Children must use their root prefix
  and reference a root in that release. Questions use child IDs; plans select roots.
  Deprecation preserves foreign keys; no specialist seed or historical backfill.
- Source enabling needs permitted/approved status, terms/permission evidence and
  review identity/time. Publishing a document needs an enabled permitted reviewed
  source, approved document rights/review, completed PII/confidentiality review and
  reviewer/time. Dates stay nullable and are never inferred from fetch time.
- Published question versions, lineage and secondary tags cannot be edited/deleted;
  content changes create another version. Available published provenance requires
  actual document-version links. Generated versions may explicitly lack provenance.
- Published source content/chunks are immutable except documented withdrawal or
  retirement with content redaction. IDs/hashes survive withdrawal for historical
  trace; withdrawn documents/retired chunks cannot be reactivated. This is a storage
  primitive, not a scheduled retention/withdrawal cache-cleanup pipeline.
- A rubric pins a published question version and has six distinct dimensions with
  anchors 0–4. Applicable technical weights sum to 100 at transaction commit;
  correctness/coverage/reasoning are applicable with positive weight. Communication
  clarity is delivery-only with weight zero. No application score calculation or
  hard-coded default weights were added.
- Known rubrics require reviewer/time; provisional rubrics cannot carry these human
  review fields. Concept review matches kind and every concept has a reviewed,
  permitted technical reference. A retired version keeps its original kind/review.
- Rubrics and children are created atomically. `creation_transaction` records the
  creation transaction's PostgreSQL `xid8`; children can be built only in that
  transaction. Later status retirement cannot unlock existing concepts/weights.
  Promotion or any content change creates a new rubric version.
- Plan item position is unique per plan. Question metadata and optional rubric must
  match the pinned question exactly. A probe has a same-plan original parent, at
  most one probe per original, and no recursive probe chain. Phase 6 implements original-question time/coverage feasibility; adaptive probe policy remains later runtime work.
- Retrieval hits reference exactly one real question version or chunk; ranks are
  unique and 1–100, similarity −1..1. Personal session/plan context must match owner.
- Scores are nullable and 0–100. Succeeded evaluations need high/medium confidence;
  abstained evaluations need no score, low confidence and reasons; pending/failed
  evaluations cannot hold scores/confidence. Provisional rubrics cannot yield high
  confidence. Supersession stays within an answer and increases revision. Terminal
  evaluation rows cannot be changed; a new revision records reevaluation.
- Evaluation dimension values supplied are numeric 0–4 with known keys; concept
  evidence belongs to the same rubric, and cited reference chunks must support that
  concept. This validates stored shape, not semantic correctness/evidence sufficiency.

`knowledge_hash` requires lowercase 64-character SHA-256 syntax. `knowledge_json`
limits structured payloads to 64 KiB of PostgreSQL JSON text, with object/array checks
per field. Chunk excerpts are ≤16,000 bytes; question text ≤16,000 bytes; source
normalized text ≤1 MiB; answer/code text ≤200,000 bytes each. Media stays outside
PostgreSQL as bounded references. A format check does not verify a content hash or
remove PII; later ingestion/evaluation code must do that work.

Primary/unique keys, FK target uniques and named indexes support the relationships;
explicit indexes cover competency parents, source/document versions and hashes,
question selection/families/provenance, owned plans/retrieval/answers, evaluation
evidence, embedding entity/generation deduplication, leases and pending outbox rows.
They are access-path prerequisites, not measured performance claims. The private
Phase 3 report inventories every PostgreSQL-created constraint/index name; all
definitions are also present in SQL and the runner's history DDL.

## Legacy compatibility and private deletion

The five baseline tables and bootstrap SQL remain intact. The only baseline-table
alteration is `sessions`' redundant `(id,user_id)` unique constraint for composite
ownership foreign keys. No new session column is required: `sessionStorageKind`
returns `legacy` when an owned session has no relational plan, `versioned` when a
plan exists, or null for absent/unowned sessions. Real baseline creation never
creates plans, so current sessions remain legacy. The helper is internal only.

Existing JSONB questions/scores stay readable and unchanged, including older broad
roles/seniority. No source/rubric/confidence is invented. Later versioned flows will
write relational authority and compatible JSONB projections in the same database
transaction; future reports label legacy technical/delivery scoring separately.
Phase 3 kept report/API shapes and interviewer behavior unchanged, so no fake labels or
future controls were added now.

Session/user deletion cascades scoped plans/items/retrieval/answers/evaluations/
evidence/operations/outbox/rewards; shared questions, rubric and source history
remain. Answer redaction requires cleared text/code/artifact refs plus timestamp.
External files/provider data, browser drafts, backup erasure and minimal replay
tombstones need the later privacy workflow; cascade tests do not claim full erasure.

## PLANNED FOR LATER PHASE

The explicit reviewed local corpus import is described below; no rubrics are seeded. Internal vector search is implemented in Phase 5 (see below). No live
scorer, evaluator-confidence computation, queue executor/dispatcher,
crash-safe XP migration or retention jobs exist. `embedding_metadata` remains model-neutral, while Phase 5 now stores compatible
384d values separately. The earlier Phase 3 stock PostgreSQL fixture had no vector
extension; Phase 5 uses a pinned pgvector/PostgreSQL 16 fixture and explicitly tests
clear failure/rollback on stock PostgreSQL. Earlier placeholder vectors/models were fixtures.

Current ingestion/retrieval and Phase 6 plan completeness obey the frozen design. Future confidence gates and recovery/deletion policies remain governed by [the frozen design](target-architecture.md) and
[roadmap](implementation-roadmap.md). The storage foundation does not turn on those
capabilities. SQL administrators can disable triggers; use least-privilege application
and migration roles in the final deployment rather than treat schema checks as admin
security isolation.

## Phase 4 additions — CURRENTLY IMPLEMENTED

Migration [004_controlled_ingestion.sql](../backend/migrations/004_controlled_ingestion.sql)
adds six tables without editing earlier migrations or legacy session DTOs:

| Table | Purpose |
|---|---|
| ingestion_reviewers | Actual enabled human editorial identity; marked fictional test reviewers |
| ingestion_adapters | Common versioned permission/input/limit/withdrawal contract for each source |
| ingestion_records | Quarantine/review/publication state, input hash, screened codes, normalized-document link, candidate drafts, duplicate links and seven-day expiry |
| ingestion_candidates | Structured proposal, exact source chunk/span, hash/method, duplicate links, human review and pinned published question version |
| interview_experience_records | Version-pinned unverified company/role/nullable occurrence/track/submitter/consent/permission metadata; content and review live in the document |
| ingestion_review_events | Append-only hash/identity/action/reviewer/time/reason audit |

CHECKs bound states/shapes/identities and require review metadata on approved/published
records/candidates. Three named access indexes cover expiry, candidate record/state
and record audit times. Audit update/delete triggers reject mutations. An additional
question-publication trigger requires reviewer/time and available linked source/
document/chunk status. Existing published-version/rubric immutability remains.
Application trusted-operator boundaries validate actual review IDs and exact hashes;
SQL administrators are not isolated by these checks.

Clean pending versions/chunks remain quarantined/staged until explicit review;
flagged data keeps only hashes/codes. Withdrawal retires imported questions/chunks,
redacts source text/specifications/voluntary prose, and preserves identity/audit.
No Phase 4 table is coupled to legacy session JSONB, Phase 4 added no vector extension, and no
candidate resume/answer becomes shared knowledge. See [ingestion](ingestion.md).
The reviewed corpus is an explicit CLI import, not a migration seed or automatic
startup action. No expected concepts or rubric seeds were added.


## Phase 5 additions — CURRENTLY IMPLEMENTED

Migration `005_pgvector_retrieval.sql` enables available pgvector and adds:

| Structure | Purpose |
|---|---|
| `embedding_generations` | Model/revision/dimension/normalization/embedding-version registry, count, staged/active/retired status and activation time; one global active generation |
| `embedding_vectors` | FK to Phase 3 metadata, duplicate-group identity and finite normalized `vector(384)` value |
| `retrieval_available_chunks` (view) | Complete permitted/reviewed/non-fixture source/document/chunk availability |
| `retrieval_entities` (view) | Eligible reviewed questions and separate technical-reference chunks, with actual aggregated provenance |
| `retrieval_results.provenance_snapshot` | Bounded historical JSON lineage checked against actual source/document/chunk/question relationships |

Existing `embedding_metadata` contains exclusive question-version/chunk identity,
purpose, model/revision/dimension/normalization, content hash, embedding version,
corpus generation/status and timestamp; it is not duplicated into an alternative
store. Active identity indexes, a generation/status index, immutable vector metadata,
deferred space checks and withdrawal triggers keep states compatible. Exact cosine
search uses filtered SQL; no ANN index is created for this small corpus. Migrated
fixtures have 41 tables including migration history (39 prior + 2 new), plus views.

Retrieval outcomes add `success`, `no_match`, `invalid_filters`, `model_mismatch`,
`corpus_unavailable`, preserving historical outcome values. Legacy sessions remain
JSONB and unchanged. Candidate private tables are not read by indexing. See
[retrieval contract](retrieval.md) and [migration operations](migrations.md).

## Phase 6 additive planner persistence

Migration `006_interview_planner.sql` adds `interview_plans.setup_snapshot`, `confirmed_at`, creation-transaction identity; `plan_items.provenance_refs`; and `sessions.interview_plan_id` with composite owner/session FK and unique link. Relational plan/item UUIDs are durable identity. Selected retrieval records are owned and plan-linked. Planner-v1 snapshot/items become immutable outside their creation transaction; deferred constraints enforce count/coverage/difficulty/time/category/order/family/group invariants. Item publication requires actual compatible selected owned evidence, matching current provenance and active available vector lineage. Old plan contracts remain valid; old JSONB sessions and migrations 001–005 are unchanged. No new rubric/probe/job behavior. See [planner](interview-planner.md) for API, confirmation and legacy projection.

## Phase 7 rubric/evaluation persistence

Forward migration `007_rubric_evaluation.sql` leaves 001–006 untouched. New `rubric_drafts` and `rubric_review_approvals` bind immutable canonical concept packets, SHA-256 and actual enabled human reviewer to an exact question/rubric version. Existing rubric versions gain draft/hash linkage. New session `scoring_version` defaults to legacy; fresh confirmations opt into rubric-v1. `reviewed_summary` complements the JSONB projection without overwriting legacy scores. Answer attempts gain selected rubric, grounding snapshot and original/probe lineage; immutable answer/artifact anchors permit privacy redaction but prohibit restoration.

Existing evaluations gain rubric classification, feedback, concept summary and objective evidence; rubric-v1 abstention alone may have no rubric. SQL enforces five finite 0–4 dimensions, fixed deterministic total, reviewed approval, provisional confidence ceiling, consecutive supersession and complete concept judgments. Existing evidence records preserve concept/reference/span/artifact linkage. `coding_execution_evidence` stores owned question index, exact code hash/language and reported runtime facts, never fabricated test success. Public detail/list/analytics reads withhold unavailable grading evidence; immutable audit grades remain. Owned deletion cascades private history and preserves shared knowledge. No source/corpus/embedding reseed is part of this migration. See [operator/scoring contract](rubric-evaluation.md).
