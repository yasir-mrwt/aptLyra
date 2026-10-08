# Aptlyra

**Practice with evidence. Improve with confidence.**

Aptlyra is an AI technical interview preparation platform for final-year students and junior software engineers with 0–2 years of experience. It helps candidates practice; it does not make hiring or personality judgments.

## CURRENTLY IMPLEMENTED

- Authenticated accounts, owned session history, dashboard and legacy interview reports.
- Junior setup for Software Engineer, Backend Developer and Full Stack Developer; English; oral, coding and mixed modes; Python and JavaScript coding choices.
- Deterministic retrieval-backed planning across 1–4 selected competency roots. Plans preserve coverage, difficulty targets, estimated duration, stable item IDs, provenance and explicit shortages.
- A persisted plan preview before confirmation. The server selects questions; confirmation starts practice through the existing runner. Confirm retries are idempotent.
- Permission-aware ingestion, withdrawal and an exact-hash human-reviewed corpus of 48 locally authored/AI-assisted questions. Editorial provenance is labeled accurately; no company interview-bank authenticity is claimed.
- Protected source registry with permission-hash review, disable/withdraw controls, bounded REST/JSON and RSS/Atom collectors, durable collection scheduling, quarantine import and cautious reviewed trend summaries. No real third-party source is currently enabled.
- Internal semantic retrieval using pinned local CPU embeddings and PostgreSQL/pgvector. Source availability, model compatibility and corpus completeness are checked before use.
- Lyra, the SVG interviewer, with cloud/browser voice, code and diagram tools, legacy technical/delivery feedback and PDF reports. Provider-dependent features require configuration.

Planning is evidence-backed. Newly confirmed interviews use **rubric evaluation with separate evaluator confidence**: reviewed or provisional scores require approved grading evidence; insufficient grounding withholds the score. Previously confirmed and historical sessions retain legacy grading. See [rubric operations and readiness](docs/rubric-evaluation.md). Planning time is an estimate, including a four-minute probe reserve, rather than a runtime deadline.

The current corpus has no eligible company reports or reviewed technical-reference/rubric bank. Company/date choices appear only when supporting evidence exists. Resume/JD personalization is unavailable in the planner; design-lite is optional in mixed mode. Coding coverage varies by competency, so setup may need correction. Existing sessions retain their legacy behavior.

## IN PROGRESS

Phase 8.5 source-to-interview database E2E, operator workflow completion and full disposable-store regression remain to be verified. No live provider permission or source was fabricated. Phase 9 remains unstarted. See the [implementation roadmap](docs/implementation-roadmap.md).

## Architecture and stack

React 19 / TypeScript / Vite → Express 5 / TypeScript → FastAPI / Python 3.11. Express owns authentication, orchestration and all durable writes. PostgreSQL stores sessions, versioned knowledge, immutable plans and pgvector evidence. Redis/BullMQ supports existing jobs and caches. FastAPI computes embeddings and provider-backed AI responses; it has no database access.

The planner is deterministic backend code. The main setup flow uses it, while confirmed questions are projected into the existing JSONB session runner. See [architecture](ARCHITECTURE.md), [planner](docs/interview-planner.md), [schema](docs/database-schema.md) and [retrieval](docs/retrieval.md).

## Local setup

Use Node **20.19+ within 20.x** and Python **3.11**. Run `npm ci` separately in `backend/` and `frontend/`, then follow [SETUP.md](SETUP.md) for Python installation and private environment configuration. Environment examples contain variable names and placeholders; keep real credentials out of Git.

Apply reviewed migrations explicitly with the backend migration CLI; the web server does not apply knowledge migrations. An indexed, compatible active corpus is required for planning. See [migration operations](docs/migrations.md), [ingestion](docs/ingestion.md), [model selection](docs/embedding-model-selection.md) and [retrieval setup](SETUP.md#phase-6-planner-setup).

Start the AI service, backend and Vite frontend as documented in SETUP.md. Disposable local PostgreSQL/Redis fixtures are defined in `compose.test.yml`; they are separate from any production or staging datastore. Local model files remain outside Git. CPU embeddings need the pinned model files and model license/attribution NOTICE; legacy voice/evaluation uses configured external providers.

## Testing

From `backend/`: `npm run lint`, `npm run typecheck`, `npm test -- --runInBand`, `npm run build`. With disposable Compose PostgreSQL/Redis running, also run `npm run test:schema`, `npm run test:ingestion`, `npm run test:seed`, `npm run test:retrieval`, `npm run test:planner`, `npm run test:persistence` and `npm run test:smoke`. The optional stock-PostgreSQL profile supports `npm run test:pgvector-unavailable`.

From `frontend/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. AI checks and model evaluation are described in SETUP.md and the model decision document. Fixture tests establish behavior, not model quality or study results.

## Deployment notes

[DEPLOYMENT.md](DEPLOYMENT.md) and `render.yaml` describe the existing deployment structure. Production requires reviewed migrations, pgvector availability, pinned model provisioning, private credentials and release verification. No production migration or deployment is performed by this phase. Existing resource names and persisted preference/asset identifiers are retained where compatibility requires them; see the [current branding and compatibility audit](docs/branding.md).

Screenshots from the earlier interface have been removed from this README because they do not show the planner. Reusable assets remain available; final screenshots belong to the later UI phase.

## License and attribution

Distributed under the [MIT license](LICENSE), including the original copyright and permission notice. Upstream and model attribution is collected in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Existing contributor metadata and dependency/model notices are preserved; the Aptlyra product name does not change ownership of upstream work.

## Product identity and domain readiness

Current product identity is Aptlyra; the interviewer is Lyra. English Groq Orpheus defaults to `hannah`, with private environment overrides retained and browser speech fallback preserved. See [voice audition](docs/voice-audition.md) and [branding, email, SEO and domain operations](docs/branding.md). The local folder, stable storage/source identifiers and legal attribution retain their existing names.

### Durable interview execution

Phase 8 connects planner-backed interviews to SQL-backed received claims, leased BullMQ execution, targeted retry, durable probes, report completion and idempotent SQL rewards. Reload/reconnect restores saved progress through owned REST. Apply migration 008 explicitly and share a private persistent audio staging volume across API/workers. Legacy scoring remains compatible, and missing approved scoring material still produces an abstention. See [runtime and recovery](docs/runtime-recovery.md). No provider invocation is promised to occur only once; committed grade/reward effects are protected against replay.
