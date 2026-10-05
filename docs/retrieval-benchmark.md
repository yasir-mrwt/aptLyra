# Phase 5 retrieval development benchmark

## CURRENTLY IMPLEMENTED

This is a reproducible development check using the approved 48-question seed,
32 manually labeled public junior-SE queries, all 8 roots / 24 children and multiple
categories/difficulties. Expected stable seed keys map to actual database-local
question-version IDs through stored provenance. Labels were specified before model
measurements. Neither labels nor results are the future Phase 11 held-out evaluation.
No statistical significance, general accuracy or technical-ground-truth claim is made.

The final run used real pinned L3 MiniLM CPU embeddings through FastAPI, the backend
embedding CLI and internal retrieval service, and PostgreSQL 16 / pgvector 0.8.2.
Hardware: Apple M1 macOS host, Linux ARM64 Docker, Python 3.11, Node 20.20.2;
ONNX uses two intra-op threads / one inter-op thread. Native macOS, Windows,
cloud latency, deployment memory and concurrent throughput were not measured.
Metrics and model/generation identity are retained in
[the safe result artifact](retrieval-benchmark-results.json); no vectors or DB dumps
are checked in. The [shortlist decision](embedding-model-selection.md) separately
compares two real encoders; its CPU times exclude HTTP/PostgreSQL/audit work.

### Corpus and relevance

| Check | Final result |
|---|---|
| Eligible / embedded / skipped / failed, first CLI run | 48 / 48 / 0 / 0 |
| Repeated CLI run | 48 eligible / 0 embedded / 48 skipped / 0 failed |
| Active vectors before withdrawal | 48 question-selection, 384d, one compatible generation |
| Expected question at rank 1, unfiltered | 29/32 (90.625%) |
| Expected question present in top 5, unfiltered | 32/32 (100%) |
| Expected question present in top 5, root-filtered | 32/32 (100%) |
| Root + role checks | 96 requests (3 per query), 0 violations |
| Child + category + difficulty checks | 32 requests, 0 violations |
| Returned family uniqueness | Passed across measured requests |
| Technical-reference no-evidence | Passed; corpus has 0 reviewed technical references |
| Model/corpus mismatch | Passed; explicit unavailable/mismatch outcomes |
| Unknown company / unknown occurrence date | Passed; no relaxed constraints or fabricated match |
| Exact normalized text | Passed; exact_match with the stored question ID |
| Withdrawal | Passed; affected vector retired and absent from new hits |
| Durable lineage / historical evidence | Passed; snapshots persisted and historical results retained |
| Raw query retention | 0 stored raw queries |

The seed contains no real company reports and no exact/near duplicate groups.
Positive company/date/role behavior and nontrivial duplicate collapse/exclusion are
therefore verified by explicitly synthetic deterministic SQL/vector fixtures in
`backend/tests/retrieval.test.mjs`, separately from these real relevance measurements.
Those fixtures do not create publication approval, real company evidence or model
quality measurements. The fixture suite also checks forged IDs, failed/retried
staged jobs, model/hash/version fingerprints, unavailable lineage and an embedding/
index-completeness race. All 16 retrieval tests pass.

### Latency

Warm measurements use 96 root-filtered requests, three per labeled query, with
no retrieval cache. The reported median is the sorted upper-middle observation;
p95 is the nearest-rank observation. Each total includes eligibility/model checks,
query embedding HTTP, locked availability/index revalidation, cosine ranking,
durable evidence writes and **transaction commit**.

| Warm component | Samples | Median ms | p95 ms |
|---|---:|---:|---:|
| Query embedding HTTP (includes CPU computation) | 96 | 11.266 | 16.199 |
| PostgreSQL filtered vector-ranking query only | 96 | 78.461 | 162.765 |
| Total backend retrieval through committed audit | 96 | 1131.590 | 1242.838 |

The vector-query timer excludes other SQL eligibility checks, lock acquisition and
audit persistence. Component medians/p95s cannot be added to derive total quantiles.
The total p95 is **above the 1000 ms design target**. This target is not the
Phase 5 pass condition. Earlier timing taken before commit was incomplete and is
superseded by this final result. The end-to-end remainder needs profiling before
claiming a bottleneck or adding a cache; caching cannot replace rights/availability
checks and durable evidence. No cache or ANN performance benefit has been measured.

After restarting the embedding process, the first query took
**512.632 ms HTTP**, including
**478.516 ms service processing** (hash verification,
model initialization and first encoding). This is one process-cold request with
artifacts already downloaded and OS/filesystem caches potentially warm; it is not
an OS-cold boot or download benchmark. The separate shortlist measures encoder
initialization across three loads per model and reports its median/p95.

### Reproduction and limitations

Follow [SETUP](../SETUP.md#phase-5-local-retrieval-verification--currently-implemented)
to prepare checksum-pinned artifacts outside Git and start only disposable Compose
services. Unset all external PostgreSQL/Redis environment URLs first. Build backend,
restart the Compose embedding service for the first-load measurement, then run
`npm --prefix backend run retrieval:benchmark`. The script creates a random local
DB, publishes only the exact previously approved seed bytes, performs the real
embedding job and retrieval checks, writes safe metrics to `/tmp`, and drops the DB.
Generation IDs differ between fresh publications because entity/version UUIDs are
part of the fingerprint. Withdrawals happen after the initial 48-active count.

This small authored/AI-assisted seed is editorial selection material classified
`unverified`, with no reviewed rubric/reference ground truth. A labeled expected
hit is not an exhaustive relevance judgment; hit-rate@K is not Precision@K. The
0.30 cosine threshold is a development setting, not calibrated confidence. All seed
questions fit the selected 128-wordpiece limit; future references require suitable
chunks. The job currently fails closed above 1000 entities. Broader, independently
labeled evaluation and scale/platform profiling remain future work.

No live interview behavior change in Phase 5; retrieval is ready for the Phase 6 planner.
