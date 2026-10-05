# Junior software-engineering competency taxonomy

## CURRENTLY IMPLEMENTED

Questions currently carry a broad role, level, and oral/coding/system-design kind.
There is no persisted competency hierarchy or competency-level rubric/report.

## PLANNED FOR LATER PHASE

Taxonomy version: `junior-se-v1`. The eight root IDs below are stable identifiers,
not database tables created in Phase 2. Child IDs use `<root>.<slug>`. **Easy** means
explain or trace one familiar concept; **standard** means apply it to a small problem;
**stretch** means justify an edge case or trade-off within junior knowledge. Each
question has one primary child and optional secondary tags. Secondary tags aid
search and explanations but do not multiply aggregate scores.

| Root | Subcompetencies (child suffixes) | Expected junior knowledge | Example categories | Easy → standard → stretch | Observable answer evidence |
|---|---|---|---|---|---|
| `dsa` — Data Structures & Algorithms | `structures`, `complexity`, `search-sort` | Arrays/maps/stacks/queues, elementary trees, Big-O, searching/sorting; choose a suitable structure | Conceptual, coding, debugging | Compare array/map → implement duplicate detection → explain collision/space trade-offs | Correct trace, boundary cases, justified structure, time/space derivation; passing examples alone are insufficient |
| `oop` — Object-Oriented Programming | `encapsulation`, `polymorphism`, `composition` | Interfaces/classes, state hiding, substitution, inheritance vs composition; basic maintainable decomposition | Conceptual, scenario, debugging | Explain encapsulation → refactor a small class → justify composition over fragile inheritance | Concrete invariant, interface example, correct dispatch, identification of coupling; terminology without an example is weak evidence |
| `dbms-sql` — DBMS / SQL | `queries`, `modeling`, `transactions-indexes` | SELECT/joins/grouping/NULL, keys/normalization, transaction atomicity, basic isolation and index costs | SQL, conceptual, scenario | Simple SELECT → join/aggregate with duplicates → explain transaction anomaly or index choice | Correct result including NULL/duplicates, schema constraints, rollback reasoning, query/index trade-off |
| `os` — Operating Systems | `process-thread`, `memory`, `synchronization` | Processes vs threads, stack/heap/virtual memory, races/locks/deadlocks; no kernel implementation | Conceptual, scenario, debugging | Distinguish process/thread → locate a race → propose lock ordering and explain limits | Valid interleaving, ownership/lifetime reasoning, deadlock conditions, feasible synchronization |
| `networks` — Computer Networks | `transport`, `http-dns`, `tls-basics` | TCP/UDP purpose, DNS lookup, HTTP lifecycle/status, HTTPS trust basics; no cryptographic proofs | Conceptual, scenario, debugging | Explain TCP vs UDP → trace URL to response → reason about timeout/retry/TLS failure | Ordered request path, protocol distinctions, correct status/retry interpretation, bounded security assumptions |
| `backend-web` — Backend / Web Fundamentals | `api-contracts`, `auth-validation`, `persistence-jobs` | REST contracts, validation, authentication vs authorization, pagination, transactions, caches and background jobs | Scenario, debugging, conceptual | Explain REST operation → design owned-resource endpoint → reason about duplicate jobs/cache invalidation | Request/response example, ownership check, error cases, idempotency boundary, consistency explanation |
| `design-lite` — Basic System Design | `requirements`, `service-data`, `reliability` | Clarify a small product, draw client/API/store, choose data relationships, explain one bottleneck/failure | System-design-lite, scenario | Sketch CRUD service → design a small booking API → discuss concurrency/caching limits | Stated assumptions, component/data flow, valid schema outline, realistic failure/trade-off explanation; drawing aesthetics are irrelevant |
| `programming` — Programming / Coding | `control-data`, `debug-test`, `error-handling` | Functions/collections/control flow, readable decomposition, tests, exceptions/async basics in chosen language | Coding, debugging, scenario | Trace loop → fix bug with tests → handle asynchronous failure/edge cases | Working logic, diagnostic explanation, useful tests, boundary handling, language-accurate semantics |

The table defines all 24 initial child IDs. New children require a taxonomy version
and review; no arbitrary source tag becomes a competency automatically. A DSA coding
question is primarily `dsa` when algorithm choice is the learning objective; it is
primarily `programming` when language logic or debugging is the objective.

## Role presets and coverage

| Role | Default core emphasis | Optional supporting roots |
|---|---|---|
| Software Engineer | `dsa`, `programming`, `oop`, `dbms-sql` | `os`, `networks`, `backend-web`, `design-lite` |
| Backend Developer | `backend-web`, `dbms-sql`, `programming`, `networks` | `dsa`, `oop`, `os`, `design-lite` |
| Full Stack Developer | `backend-web`, `programming`, `dbms-sql`, `oop` | `networks`, `dsa`, `os`, `design-lite` |

The candidate chooses 1–4 roots; selecting more than the effective question count
requires an explicit setup correction. Presets are defaults, not fixed score
weights. Resume/JD suggestions may prioritize selected children but cannot silently
add specialist topics or remove requested coverage. A small interview need not
cover all eight roots; the report names what was and was not assessed.

## Connections to later records and behavior

| Consumer | Taxonomy connection |
|---|---|
| Question/version | Primary child, secondary children, taxonomy version, junior difficulty and category; immutable when selected |
| Plan | Minimum one original question per selected root, explicit counts and estimated minutes; show gaps rather than silently widening scope |
| Rubric/concepts | Expected concepts identify child objectives and observable evidence; reviewed per question version |
| Report | Group eligible original scores by primary root, show sample counts/coverage and confidence; secondary tags are descriptive |
| Study priorities | Rank demonstrated missing reviewed concepts by weighted gap and repeated evidence; unassessed roots remain “not assessed,” not weak |

One weak answer suggests a practice topic, not a stable trait. Recommendations
include a permitted reference and a specific exercise. Provisional observations
are labeled suggestions and separated from reviewed-rubric weakness evidence.
Cross-session comparisons require compatible taxonomy, rubric, and scoring versions;
otherwise show the sessions separately.
