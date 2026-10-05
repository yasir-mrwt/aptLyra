# Knowledge source policy v1

## CURRENTLY IMPLEMENTED

Only internal local-file imports are enabled. A source starts disabled; a real human operator reviews a contract containing exact approved input hashes, permission/license evidence, terms revision and attribution before enabling it. Local files can be authored material, permission-approved technical references or explicit-consent experience reports. Test fixtures are marked and excluded from actual corpus counts. A license identifier is a recorded assertion, not automated legal verification.

Allowed source classes: locally authored/reviewed TechVera material; explicitly licensed or permission-approved references; permitted APIs/feeds **only once a reviewed adapter exists**; voluntary reports with separate publication consent; controlled test fixtures. Public availability, copied license text, a model's assertion or a fetch timestamp never grants rights. Every content revision requires the appropriate permission and editorial approval before publication.

Prohibited: LinkedIn scraping, login/paywall bypass, leaked question banks, confidential take-home tasks/employer material, unknown-permission sources, autonomous crawling, raw candidate resumes/answers/audio in shared knowledge. Neither ingestion code nor seed accesses private interview/resume tables. No external material was fetched or represented as a permitted company bank in Phase 4.

Human review must verify rights, attribution, junior technical quality, mapping, duplicates, PII/confidentiality and scope. Actual identity/time/hash are recorded separately from content; a model cannot self-approve. Known concepts/rubrics require valid reviewed technical references and actual human review under Phase 3 constraints. Original editorial context in this seed is **not** a reviewed rubric or standalone technical reference. Experience evidence suggests topics/selection and cannot establish correctness.

Suspect content is discarded at import and only hash/codes retained. Clean pending content is inaccessible for publication after seven days; an operator runs `expire` for physical purge. Withdrawal suspends source or retires imported versions/chunks/questions and redacts source content/specifications and voluntary claim/consent text, preserving minimal audit identity. Retired immutable question history remains unavailable for new selection. Review the complete availability chain in later Phase 5 code; no retrieval exists today.

Seed approval is limited to Muhammad Yasir's exact review packet SHA-256 `be9d40c94f1941374a7332fd4b15cbe940ab6cc4e58495b4a0877c40cfb7b7cd`, which explicitly pins JSON corpus SHA-256 `b85d0e09bb94eaf6751a0ae3a86ffb1f76169ee4faf6e314b60f579cee69e995`. The [attestation](../backend/data/ingestion/seed-review-attestation.json) records the actual user statement, developer role and 2026-10-05 review date. It covers only those matching 48 originals, not future edits, unrelated sources, company claims, rubrics or independent research validation. The approved review packet retains its original pending-review heading as an immutable historical request artifact; the separate attestation records its later approval.

## PLANNED FOR LATER PHASE

No HTTP/feed adapter, scraper or public voluntary-submission API is enabled. Before any network adapter: review terms, origin and redirect allowlists, DNS/address/connection pinning, byte/time/rate limits, authentication, refresh/expiry and withdrawal. Before public submissions: explicit consent, PII/confidentiality warning, moderation/status/withdrawal and authorized access. Never infer these controls from test fixtures.

Operational details and heuristic limits are in [ingestion](ingestion.md); privacy requirements remain in [data/privacy](data-and-privacy.md).
