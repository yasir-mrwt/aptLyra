# Controlled local ingestion

## CURRENTLY IMPLEMENTED

The backend owns all durable writes. [The internal repository](../backend/repositories/ingestionRepository.ts) extends Phase 3 publication primitives; [the CLI](../backend/ingestion/cli.ts) runs separately from interviews. No HTTP admin or submission route, queue executor, FastAPI change or model extraction exists. OS/database access is the editorial authorization boundary. Restrict access to operators; never expose this CLI through an unauthenticated wrapper. SQL administrators remain trusted and can bypass application conventions.

No candidate-facing Phase 4 behavior; reviewed corpus is preparatory for Phase 5/6.

## Common adapter contract

`local-file` / `1` accepts exact canonical `.md` and `.json` input paths. Every contract records source class, allowed inputs, **approved SHA-256 input hashes**, permission evidence, license identifier, terms revision, attribution, operator-filesystem authentication, manual refresh, byte/time/document/rate budgets, explicit occurrence vs observed fetch timestamps, retire-and-redact withdrawal, raw-retention prohibition and fixture marker. Registering the contract leaves the source disabled/proposed/unknown; a separate human approval of the inspect-source contract hash enables it. Empty approved hash lists cannot register. Editing even an allowlisted file requires new permission/review; registration never derives rights from source content.

Maximum file size is 256 KiB, deadline 5 seconds, document count 80 and document normalized content 12,000 UTF-8 bytes. A source can choose lower ceilings and a minimum interval up to one hour. Canonical paths and no-follow/nonblocking opens reject symlinks and nonregular files. A fixed-size read catches growth after stat. Elapsed time is checked before returning; this is a local regular-file elapsed budget, not a cancellable guarantee against a stalled operating-system filesystem call. Operators must use trusted local directories, not adversarial/network mounts. Rate checks serialize successful imports; invalid-file attempts are bounded individually, not an internet abuse/rate-control service.

HTTP ingestion is deferred: no HTTP adapter or crawler is present, so no partial SSRF allowlist is advertised. Public accessibility is never permission. Voluntary reports use structured local import with explicit consent, not a public submission API.

## Input and extraction

JSON is strict `schemaVersion: local-v1`, `documents: [...]`. Each document permits only `key`, `title`, `text`, `questions`, `experience`. A question permits only `text`, `category`, `difficulty`, `primary`, `secondary`, `roles`; examples are in [the reviewed seed](../backend/data/ingestion/junior-se-seed.json). Questions must appear verbatim after normalization inside supplied document text. Unknown fields, source/chunk IDs, fake review/permission fields, specialist categories/competencies or unsupported roles are quarantined/rejected. Actual document/chunk IDs and UTF-16 start/end offsets are assigned by the backend. The frozen `junior-se-v1` child allowlist is read from PostgreSQL.

Each document becomes one bounded chunk with section `document`, chunker `local-document-v1`, full normalized offsets and a hash. Structured question extraction is deterministic (`structured-local-v1`), with null model/prompt IDs, roles, origin links and review hints. Markdown supports reviewed document ingestion but contains no automatic question extraction; authors use structured JSON for questions. This deliberately avoids guessing classification from arbitrary prose. It is not LLM extraction or an autonomous agent. Source text cannot select URLs, SQL, tools or models.

## Lifecycle and review

Approved source → received/quarantined audit → normalized → review_required → explicit approval → published; rejection, expiry or withdrawal terminate availability. Screening failures store only a file hash and bounded codes; raw content, titles, experience metadata and candidate text are discarded. Clean normalized text/specifications remain in quarantine for review, with a seven-day expiry. Expiry blocks approval/extraction/publication immediately. `expire` purges text/specifications and voluntary claim/consent fields; **an operator must schedule/run it** to enforce physical cleanup. No retention daemon is claimed.

A human operator registers their actual review identity and attests permission and editorial review of exact hashes. Never register a model as human. Reviewer IDs must exist/enabled; fictional reviewers and sources work only under test configuration and are excluded from real corpus totals. Approvals cannot originate inside documents. Document approval attests privacy/confidentiality and establishes permission/review metadata; question approval is separate. Batch approval explicitly attests one complete exact input hash and performs document/chunk/question publication in one SQL transaction, failing closed on suspicious content, duplicates or invalid mappings. Batch is an operator convenience, not automated editorial approval.

All lifecycle mutations use the existing transaction/advisory-lock infrastructure under one editorial lock; file reads occur outside the transaction and rights are rechecked before commit. Audit events are append-only. Phase 3 immutability remains, and migration 004 additionally requires review identity/time and available provenance for question publication. Direct internal Phase 3 primitives do not become public authorization APIs.

## Normalization, screening and duplicates

Normalize UTF-8/NFKC, CRLF, bounded markup/boilerplate, whitespace and metadata. Invalid UTF-8/control-byte/binary input fails. Screen **before** removing HTML/comments/scripts to preserve hidden attack signals. Emails, common phone/identifier/address formats, obvious credentials/private-key markers, confidential-employer language, third-party name indicators and instruction/approval/fetch patterns produce codes only. Flagged inputs require a corrected/redacted new file and renewed hash permission; the CLI cannot override signals. These heuristics have false positives and false negatives and never replace human review. No raw matches are printed.

Exact SHA-256 and lowercase three-token-shingle Jaccard ≥0.8 produce explicit duplicate links. At most 1,000 documents/candidates are compared; exceeding the budget fails closed. Threshold is an engineering heuristic, not measured semantic recall. Exact duplicates require `retain-provenance`; near duplicates require `distinct` or `retain-provenance`. No paraphrase is silently merged. Referenced canonical candidate/document identity, similarity and editorial decision survive in records/audit; explicitly retained duplicates remain separate versions, so later retrieval must choose a canonical item rather than count them as additional unique questions.

## Experience reports and withdrawal

Only a `voluntary-experience` source can carry `experience`: company, supported role, nullable `occurredOn`, nullable track, submitter type, consent evidence and permission revision. Described topic/question and redacted text reside in the document; review and provenance join to its version. Claims are always `unverified-report`; quality is `reported-experience`, never technical-reference truth. Unknown occurrence remains null. `isRecentExperience` requires a valid known occurrence within 180 days before planning; fetch/submission/review times cannot satisfy recency. Future occurrences do not qualify. No actual company experience is seeded.

Withdraw source/document/question through the CLI. Source suspension and permission expiry block future import/publication. Document withdrawal retires all linked imported question versions and chunks, clears excerpts/normalized text/draft specifications and voluntary company/track/consent prose, and preserves identity/hash/audit. Historical immutable question versions remain for trace with retired status. Question-only withdrawal retires the version. No retrieval cache/vector exists to purge; later readers must check the complete source/document/chunk/question availability chain. Approved technical references and rubric generation are not created by this phase; Phase 3 known/provisional constraints still apply.

## Internal commands

Configure the intended database privately, use Node 20.x, build and explicitly migrate. Examples below are templates; UUIDs/hashes come from safe CLI outputs. Never put real credentials in commands, logs or Git.

```bash
cd backend
npm run build
npm run db:migrate
npm run ingestion -- --help
npm run ingestion -- register-reviewer human-editor "Actual Human Name" human
npm run ingestion -- register-source local-source "Reviewed local source" /absolute/operator/contract.json
npm run ingestion -- inspect-source SOURCE_UUID
npm run ingestion -- approve-source SOURCE_UUID human-editor CONTRACT_HASH
npm run ingestion -- ingest SOURCE_UUID /absolute/allowlisted/file.json
npm run ingestion -- inspect RECORD_UUID
npm run ingestion -- extract RECORD_UUID
npm run ingestion -- approve-document RECORD_UUID human-editor NORMALIZED_CONTENT_HASH
npm run ingestion -- publish-document RECORD_UUID
npm run ingestion -- approve-question CANDIDATE_UUID human-editor QUESTION_HASH
npm run ingestion -- publish-question CANDIDATE_UUID
npm run ingestion -- reject-document RECORD_UUID human-editor pii-rejected
npm run ingestion -- reject-question CANDIDATE_UUID human-editor editorial-rejected
npm run ingestion -- withdraw-question CANDIDATE_UUID human-editor editorial-withdrawal
npm run ingestion -- withdraw-document RECORD_UUID human-editor consent-withdrawn
npm run ingestion -- withdraw-source SOURCE_UUID human-editor source-withdrawal
npm run ingestion -- expire
npm run ingestion -- manifest
```

Append `distinct` / `retain-provenance` only after adjudicating duplicate links. After actual review of an entire file, `approve-batch SOURCE_UUID EXACT_INPUT_SHA256 human-editor` replaces per-item approval/publication. Safe inspect output contains IDs/hashes/status/signals/duplicate links/offsets, not content. A reviewer inspects the permitted source file through their restricted editor. For staging/production, every CLI operation additionally requires a final `--apply`; this is a deliberate launch guard, not a new authentication system.

Seed manifest helpers and approved artifacts are repository-checkout tools, not files bundled into the unchanged backend runtime image. A container operator can mount permitted source files explicitly and use a reviewed portable contract; no container seed deployment is claimed.

The example seed contract records a workspace-specific canonical path; on another checkout an operator creates a portable contract with the exact canonical path and **same approved bytes/scope**, then reviews its hash. The human attestation is historical evidence, not permission for other sources or future edits. [Corpus manifest](corpus-manifest.md) explains its exact artifact binding and reproduction.

## Verification and exclusions

```bash
# Product root; external datastore environment variables unset
npm --prefix backend run test:schema
npm --prefix backend run test:ingestion
npm --prefix backend run test:seed
npm --prefix backend run corpus:seed-manifest
```

Start/stop the disposable stores as in [SETUP](../SETUP.md). Schema/ingestion/seed suites create and remove isolated random databases. Fictional PII, consent and reviewer fixtures establish controls, not external legal rights. `test:seed` verifies the actual user-approved packet/hash, runs the real CLI and actual recorded review, verifies 48 available published questions, then removes the database. No deployment/persistent production import is performed.

## PLANNED FOR LATER PHASE

Embeddings/model/index selection and filtered pgvector retrieval belong to Phase 5; planner and live selection to Phase 6; concepts/rubrics/scoring/confidence to Phase 7. HTTP adapters, public consent UI, automated retention scheduling, release access isolation and wider source acquisition require explicit later scope/review. No RAG, new scoring, live interview controls, provider calls, frontend redesign or 3D Ava is introduced.
