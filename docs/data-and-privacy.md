# Data boundaries and privacy requirements

## CURRENTLY IMPLEMENTED

Cookie authentication/owned-resource checks, internal shared-key authentication,
bounded uploads, configured resume callback destinations, constrained Cloudinary
diagram fetches, schema validation and normal-path temporary audio cleanup exist.
Backend and AI providers process candidate content. Browser IndexedDB stores drafts;
resumes and diagrams may remain in local/provider storage. The current application
does **not** provide a verified retention scheduler, comprehensive account erasure,
provider-side deletion, encrypted per-user content, callback replay defense, or
durable deletion/recovery jobs. Development email flows may print OTPs. Managed
connection TLS currently has certificate-verification exceptions documented in
[SECURITY.md](../SECURITY.md). Do not describe the baseline as fully private,
compliant, or production hardened.

## PLANNED FOR LATER PHASE

Classification applies to the **final FYP**, not to what already exists:
**Required for FYP** is a release gate; **Recommended** is beneficial if feasible;
**Deferred** is outside the frozen delivery commitment. Ingestion controls ship
before an adapter is activated; privacy consent ships with its functional feature;
Phase 10 closes and verifies the remaining security/recovery gates.

| Boundary | Classification | Target policy / evidence required |
|---|---|---|
| Resumes / JD context | Required for FYP | Owned opt-in context; bounded PDF/DOCX/text parsing; strip contact details/identifiers before AI planning; candidate can inspect/disable minimal skills/project summary; never publish raw uploads |
| Interview audio | Required for FYP | Explicit mic/recording indicator and consent; typed alternative; send only accepted audio to configured STT; delete transient server recordings after success/failure, with recovery cleanup within 24 hours |
| Transcripts / answers | Required for FYP | Owner-scoped SQL records, bounded input, minimized provider payloads; candidate can delete session and answer artifacts; never index them in shared knowledge retrieval |
| Diagrams / profile media | Required for FYP | Verify ownership/reference to uploads, bounded image formats and allowed fetch destinations; delete owned provider artifacts through tracked cleanup operations; distinguish avatar from assessed evidence |
| Knowledge content | Required for FYP | Permission/license/terms evidence before use; review/PII quarantine, quality labels, withdrawals and attribution; no leaked/confidential employer tasks or prohibited LinkedIn scraping |
| Model prompts | Required for FYP | Only necessary question/rubric/evidence and current answer; no account credentials/contact details; untrusted data delimited and unable to select tools/destinations; version prompts and validate output IDs |
| Operational logs | Required for FYP | IDs, timing, status/error code, versions and sizes; redact headers/tokens/OTP, resume text, transcript, answers and prompt bodies; avoid exception strings containing provider payloads |
| Provider exposure | Required for FYP | Explain configured Groq interview/STT/TTS, Gemini resume fallback, JDoodle code and Cloudinary media boundaries before feature use; review current provider policies before release; do not promise no-training/zero-retention without verified configuration |
| Retention | Required for FYP | Enforce the retention schedule below with monitored cleanup jobs; count cache and browser copies, not only PostgreSQL rows |
| Deletion | Required for FYP | Owned deletion request, immediate access denial/tombstone, cancel pending work, purge relational/JSONB/cache/media projections, track retries; stale worker/callback may not resurrect deleted content |
| Authentication / transport | Required for FYP | Preserve server-side ownership; HTTPS and verified TLS in deployment; scoped service credentials, callback operation IDs/replay rejection; secret-free logs/reports; rate/size/time limits |
| Prompt injection | Required for FYP | Treat sources, resumes, JD text, candidate answers and model output as untrusted; allowlisted references, no autonomous fetching/tool use, schema/evidence validation, adversarial fixtures; never rely on regex alone |
| PII / voluntary submissions | Required for FYP | Separate publication/research consent from interview use; remove names/contact/employer identifiers as appropriate; human review of suspected PII; reject third-party personal/confidential details |
| Research data | Required for FYP | Separate opt-in, pseudonymous IDs, limited access, withdrawal policy and approved retention; anonymized aggregate report, no raw media in product Git |
| Backups / access audit | Recommended | Encrypted backups, minimal admin roles and access/change audit; define restore-and-redelete handling and verified backup expiry before claiming erasure |
| Encryption beyond transport | Recommended | Managed encryption at rest and stronger access isolation; verify deployment configuration rather than infer it from vendor name |
| Advanced controls | Deferred | Per-user field encryption keys, enterprise multi-tenant policy engine, formal compliance certification, regional/provider-isolated inference and automated privacy proofs |

### Retention schedule to implement

| Data | Final FYP default |
|---|---|
| Server raw audio / transient extraction files | Remove at processing terminal state; recovery sweep ≤24 hours |
| Browser audio/code/diagram drafts | Clear on successful submit, session deletion or logout; expire abandoned drafts after 7 days with visible recovery warning |
| Uploaded resume file | Delete after successful minimal-summary extraction or terminal failure; cleanup ≤24 hours; summary remains owner-controlled for 90 days or earlier deletion |
| Interview transcripts/code/diagrams/evaluation/report | Retain up to 90 days from completion, then purge unless an explicit owner retention choice is implemented; manual deletion available sooner |
| Quarantined source raw content | At most 7 days for review; prohibited content discarded immediately; retain only minimal rejection metadata |
| Approved source documents/chunks | Until license/permission expires, withdrawal, or supersession policy requires purge; keep permitted version metadata for traceability |
| Operational logs | 14 days, no candidate-content payloads |
| Personalized caches | Bounded TTL, owner scope; invalidate immediately on deletion; public retrieval cache target 5 minutes |
| Consented pseudonymous research records | Up to 180 days after study closure; aggregate anonymized results may remain; participant withdrawal handled per disclosed study policy |

These defaults are planned configuration values, not an assurance about current
storage. Audio is not replayable from the server after transient deletion; explain
this in the recording flow. Providers may retain copies under their policies beyond
local deletion: disclose this limitation and use permitted minimization settings.
No provider-retention deadline or backup guarantee is asserted without verification.

Deletion completes locally only after tracked cleanup succeeds, otherwise report
pending/failure rather than “deleted everywhere.” Preserve minimal non-content audit
and operation tombstones to prevent replay; redact research linkages upon withdrawal.
References in other users' reports must not retain someone else's deleted voluntary
PII. Public-source withdrawal preserves a permitted identifier/status when possible,
with inaccessible excerpts and invalidated caches/embeddings as required by rights.

### Threat and trust boundaries

Source fetch jobs need allowlisted origins, public-address checks with validated
connection destinations, blocked unsafe redirects, byte/time budgets and restricted
network access. Extend the baseline fetch controls before new adapters. Resume
callbacks need operation-bound authentication and replay checks rather than expanding
the existing broad shared secret. Models never authorize access, approve licensing,
determine destination URLs, or award rewards directly. All provider results pass
contract/evidence checks before repository commits.

Use deterministic fixtures to verify cross-user denial, injected instructions,
forged citations, malformed uploads, replay/stale jobs, provider failures and
deletion/retention across SQL, Redis, local files, browser drafts and external-media
adapters. Record provider/backup limitations explicitly. Full threat testing and
deployment credential policy are later work in [the roadmap](implementation-roadmap.md).

## Phase 4 knowledge controls — CURRENTLY IMPLEMENTED

[Local ingestion](ingestion.md) now enforces source permission/hash scope, human
review, bounded files/text, pre-normalization PII/confidential/injection screening,
quarantine, immutable publication and source/document/question withdrawal. Flagged
payloads are discarded immediately; logs/inspect use only identifiers/hashes/codes.
Deterministic detectors are incomplete and do not establish perfect de-identification.

Permitted experience imports require explicit publication consent/permission; unknown
occurrence stays null and company claims are unverified selection evidence. No public
submission UI/API or actual external company report is seeded. Candidate answers,
resumes and audio are not accessed or indexed by ingestion. There is no provider
exposure from Phase 4 extraction because no provider is called.

Seven-day pending expiry blocks publication/extraction; the CLI `expire` action
purges normalized pending text/specifications and voluntary metadata. **Operators
must run/schedule it**; physical cleanup without that command and full account/media/
provider/backup erasure remain unimplemented. Withdrawal clears source/chunk content,
retires imported questions and preserves minimal audit; immutable historical question
versions remain retired. Later selection must check availability throughout the chain.
No cache/embedding exists yet to invalidate. See [source policy](source-policy.md).
