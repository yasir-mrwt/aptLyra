# Internal semantic retrieval — Phase 5

## CURRENTLY IMPLEMENTED

Express owns embedding jobs, durable writes, filters, pgvector queries and evidence.
FastAPI supplies CPU embeddings only and receives no database credentials.
PostgreSQL is the only vector store. No live interview behavior change in Phase 5;
retrieval is ready for the Phase 6 planner.

### Internal contract

`RetrievalService.retrieveQuestions(request)` and `retrieveTechnicalEvidence(request)`
accept query, typed filters, final limit 1–5 (default 5), candidate pool 5–20
(default 20), minimum cosine similarity 0–1 (default 0.30), and optional expected
model revision / corpus generation. They return an operation ID, typed outcome,
reason, provenance-bearing hits, generation, cache flag and timings. There is no
public search endpoint or candidate UI. The authorized local CLI is an inspector.

`POST /internal/embeddings` uses existing `X-API-Key` / `INTERNAL_API_KEY`
authentication. Body: `{"mode":"query","texts":["public query"]}` or documents
with 1–16 texts. Query mode accepts one text. Each text is nonempty and at most
4000 characters; request bytes are bounded at 262144 before JSON parsing. Unknown
fields, model selection and tools are rejected. Output contains model ID, fixed
revision, dimension 384, normalization `l2`, embedding version, finite normalized
vectors in input order and processing milliseconds. Python and TypeScript validate
counts, dimensions and finite/norm checks; PostgreSQL enforces vector typmod/norm.
No payloads or vectors are logged by these modules.

Only one inference worker runs per process. Busy requests receive `model_busy`;
a 10-second response deadline returns `model_timeout`, retaining the worker slot
until actual computation exits. Native computation is not forcibly terminated.
Backend HTTP has a 12-second deadline and 262144-byte response bound. Safe errors
include `invalid_input`, `input_token_limit`, `model_unavailable`,
`model_artifact_mismatch`, `model_failure`, `invalid_model_output`. Runtime model
paths are operator configuration, never source text or request-selected values.

### Eligibility, channels and filters

Shared SQL views require a non-fixture Phase 4 adapter, published ingestion record,
actual enabled human source/document/question reviews, permitted/enabled source,
published clean document, active non-redacted chunk, and published available
question plus active family and active primary/root competencies. Voluntary sources
require an actual non-fixture, consented experience record. Question lineage must
join actual source/document/chunk IDs and the published ingestion record's source.
Quarantine, rejection, withdrawal, fictional fixtures and private candidate
answers/resumes/audio cannot enter this path. Availability is checked on every call.

Question selection permits reviewed editorial originals, including the seed's
`unverified` source-quality classification. It does not upgrade them to technical
ground truth. Technical grounding requires `technical-reference` quality and
excludes voluntary experience sources. The current corpus has **zero** eligible
technical references and returns `no_match` / `no_permitted_source` in that channel.

Filters support taxonomy, root/child (including real secondary tags), role,
difficulty, category, origin, quality, source/review state, company, known occurrence
date bounds, excluded families/versions and already-selected question/version IDs.
Only enabled/approved states are supported. Other states and unknown taxonomy/tags
are invalid, not silently broadened. Company must be real consented experience
metadata. Date bounds use known `occurred_on` and reject future occurrences, never
publication/fetch dates. Company, quality, date and reported role must match the
same provenance entry. Company claims remain unverified reports. Missing metadata
produces no match; permissions/company/date constraints are never relaxed.

Technical chunks have no fabricated role/taxonomy tags. Those constrained reference
requests require a real `technical-grounding` question-provenance link and eligible
question tags; an unlinked reference cannot satisfy a requested competency/role.

### Generations, deduplication and exact search

Migration 005 installs available pgvector or fails clearly, keeps 001–004 checksum
safe, adds a 384d vector table tied to Phase 3 metadata and a generation registry.
Existing metadata remains model-neutral; actual vector records require matching
model/revision/dimension/normalization/version and eligible content hash. Vector
identity is immutable. One generation is active and deferred checks prevent mixed
active spaces. No approximate index is justified for 48 entities: cosine exact
search follows SQL metadata/availability filtering, with B-tree identity/status
indexes. [pgvector documentation](https://github.com/pgvector/pgvector) describes
this exact-search and cosine behavior.

`npm --prefix backend run retrieval -- embed [--dry-run]` derives a generation
fingerprint from entity/version IDs, content hashes and full model settings. UUIDs
are database-local, so generation IDs differ between disposable publications of
the same bytes. Jobs process batches of 16 outside database locks. Staged writes
are retry-safe; unchanged compatible vectors are reused across generations. Content,
entity/version or model changes require a new fingerprint and relevant computation.
Only a complete rechecked eligible set is activated atomically. A failure preserves
the old active generation and staged work for retry; retired generations cannot be
reactivated under the same identity. Counts report eligible/embedded/skipped/failed.
The current safety budget is 1000 entities, failing closed above it; no scaling
claim is made. Global corpus switch serializes with editorial writes.

Duplicate groups derive from exact hashes, family identity, Phase 4 near/exact
candidate links and retained-document relationships when question/chunk text also
has high shingle overlap. Provenance remains on every entity. SQL chooses a
representative per group before limiting to 20 groups; representatives precede
duplicate rows in the bounded audit pool so large duplicate groups cannot crowd
them out. At most 100 raw candidates
are audited, and up to five above-threshold representatives are returned. All
ranked returned candidates record selected/duplicate/below-threshold/limit reasons.
Corpus records retain provenance even beyond the bounded audit pool. Selected
family/version IDs exclude their entire duplicate group before ranking. Exact normalized text matches rank first;
otherwise cosine matches must pass threshold. Similarity is not confidence.

### Evidence and withdrawal

Outcomes: `success`, `no_match`, `unavailable`, `invalid_filters`, `model_mismatch`,
`corpus_unavailable`. Phase 3's historical `hits`/`no-evidence`/`unavailable` values
remain accepted. Reasons include exact/semantic match, no relevant hit, no permitted
source, model unavailable, corpus unavailable and invalid/mismatched input. Adjacent
junior difficulty, reviewed-seed fallback and generation belong to the planner;
Phase 5 never silently performs them.

Each operation hashes the query and persists **no raw query text**, bounded validated
filters, model/corpus/policy version, typed outcome, cache=false and candidate ranks/
selection reasons. Provenance snapshots include actual IDs, title/type/license/
attribution, quality/review, occurrence/publication/fetch times separately and policy
revision. SQL rejects forged citation IDs or mismatched source metadata. Personal
content must not be passed to the shared corpus CLI. Hashes can still be linkable;
owner/retention integration for later personalized runtime remains later work.

Source/document/chunk/question/permission/reviewer/taxonomy/consent changes retire unavailable vectors
in the same transaction. New retrieval independently rechecks complete lineage and
active generation and index completeness after query embedding, under the editorial
transaction lock. Missing newly published embeddings report `corpus_unavailable`,
not a fake match. Historical evidence is preserved; no withdrawn item is newly
returned. There is **no Redis retrieval cache**. The final total includes eligibility
checks, evidence writes and transaction commit; see the benchmark for the measured
latency and comparison with the design target. Embedding/vector-query caching has
no demonstrated benefit for those required checks and durable writes. Defer it
pending a measured comparison. Future cache/ANN work needs full filter/model/
generation/policy keys and availability revalidation. If PostgreSQL is unavailable,
the operation fails and cannot create a durable retrieval evidence record.

## PLANNED FOR LATER PHASE

Phase 6 now uses retrieval for deterministic plans and scoped frontend selection, described below. Scoring, provisional grading/confidence, adaptive probes and public source search remain planned. See [benchmark](retrieval-benchmark.md),
[model decision](embedding-model-selection.md) and [setup](../SETUP.md).

## Phase 6 planner integration

The planner now consumes this internal retrieval channel, with owned user/session operations linked to plans. Additive internal filters support source/document keys. Requested and adjacent difficulty, reviewed seed and deterministic approved-template stages retain all taxonomy/role/mode/company/date/exclusion/model/corpus/permission checks. Approved-template `structured-seed` retrieval is restricted to the reviewed original seed, uses identical current eligibility/index/evidence controls and records NULL similarity without calling the model. It is not a fake semantic match. Public clients cannot invoke these internal tools. Query raw text remains unstored. Plan persistence and confirmation recheck complete compatible corpus, provenance/availability and duplicates under editorial locks; fresh unavailable evidence is redacted. The ordinary Phase 5 semantic path and separate technical-reference channel remain intact. See [planner](interview-planner.md). Rubric evaluation and complete durable runtime are still planned.
