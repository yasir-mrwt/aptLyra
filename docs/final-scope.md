# Final FYP scope

**TechVera — Evidence-Grounded AI Technical Interview Coach**

Scope version: `fyp-scope-v1`, frozen in Phase 2. This is a preparation tool for
final-year CS students and junior software-engineering candidates with 0–2 years
of experience. Scores describe evidence in a practice interview, not employability,
personality, or a hiring recommendation.

## CURRENTLY IMPLEMENTED

The Phase 1 application provides voice interviews, generated questions, code
execution, diagram answers, resume context, score-triggered follow-ups, and PDF
reports. Its role, language, and seniority catalogs are broader than this FYP.
Company selections influence a prompt; they do not retrieve verified company
interview data. Existing ATS tools, cover letters, gamification, and analytics
remain auxiliary features. Phase 2 changes documentation, not those controls or
stored sessions. See [the current architecture](../ARCHITECTURE.md).

## PLANNED FOR LATER PHASE: supported domain

- Initial roles: Software Engineer, Backend Developer, and Full Stack Developer.
  These share junior programming and web/backend fundamentals. Full stack questions
  cover HTTP, browser/server interaction, and APIs, not a separate UI framework bank.
- Level: entry/junior only. Difficulty means **easy**, **standard**, or **stretch**
  within junior expectations; stretch does not mean senior-level systems expertise.
- Eight competency roots: `dsa`, `oop`, `dbms-sql`, `os`, `networks`, `backend-web`,
  `design-lite`, and `programming`. Exact subcompetencies and evidence expectations
  are in [the taxonomy](competency-taxonomy.md).
- English questions and transcripts initially. Coding evaluation benchmarks cover
  Python and JavaScript first; SQL exercises use PostgreSQL semantics. The existing
  editor's wider language menu is not a claim of validated rubric coverage.
- Target sessions: 15–60 minutes, 3–10 original questions, with at most two additional
  follow-ups. A time budget may reduce the requested count and must explain this
  before the interview starts. Existing API count 1–20 remains a legacy contract.
- A reviewed seed corpus is sufficient for core practice. Permitted recent
  experience reports enrich selection; no live web research is required to start
  an interview. “Recent” means a known interview occurrence within 180 days of
  planning, not merely a recent fetch. Unknown dates cannot satisfy that label.

## Interview modes

Modes and modifiers are separate in the target design. Question category is a
third axis; it is not interchangeable with a mode or provenance origin.

| Requested mode | FYP class | Frozen behavior | Current compatibility |
|---|---|---|---|
| Oral technical | Core | Conceptual, scenario, and spoken debugging questions | `oral-only` |
| Coding | Core | Small coding/debugging tasks with spoken or typed explanation; bounded checks when available | No dedicated mode today; `coding-mix` is the current transport |
| Mixed | Core | Oral plus coding/SQL categories according to persisted coverage/time budget | `coding-mix` |
| Company-specific | Optional | Modifier on a core mode; prefer permitted, dated experience evidence, show shortages; never claim an official company bank | Existing `company-specific` and company/track fields remain readable |
| System design | Optional for design-lite; deferred for advanced standalone design | One simple service/API/data-model exercise using the existing whiteboard plus explanation | Existing `system-design` question kind is broader than the target |
| Resume-aware | Optional | Consent-based modifier using a reviewed, minimal skills/project summary; candidate-selected topics remain authoritative | Existing owned `resumeId` path |

Optional modes must degrade to core practice with a visible explanation when
context or evidence is absent. No company filter is silently removed. A company
label from a voluntary account is an unverified report, not confirmation that the
company asks that question. Resume assertions are personalization context, not
technical ground truth or verification of work history.

## Explicit exclusions

General HR/behavioral interview grading; automated hiring, ranking applicants, or
“job readiness” certification; facial/emotional/personality inference; accent or
gender judgments; senior distributed-systems, research/AI-engineer, and specialist
role banks; unrestricted web scraping or prohibited LinkedIn scraping; training a
foundation model; autonomous tools acting on candidate instructions; local GPU
requirements; a second FAISS datastore; and a 3D avatar replacement are out of scope
for this FYP. Multilingual assessment, real-time barge-in, hints with score penalties,
and a comprehensive adaptive curriculum are deferred beyond the frozen scope.

Existing peripheral features are maintained for compatibility; extending ATS,
cover letters, leaderboards, OAuth providers, or unrelated role coverage is not
part of the remaining intelligence phases.

## Acceptance boundary

The final FYP must demonstrate a reproducible persisted plan, reviewed or explicitly
provisional question/rubric versions, grounded answer evidence, separate evaluator
confidence, bounded follow-ups, competency reports, source trace, retry/recovery,
and the required privacy controls. It must also publish measured retrieval/scoring
and system results with limitations. Provider availability and a successful code
run alone do not prove technical knowledge or scoring validity.

Functional setup, runner, report, and Ava behavior ship alongside each backend/AI
feature. Phase 9 consolidates visual, accessibility, responsive, and performance
polish. [The roadmap](implementation-roadmap.md) defines the phase boundaries;
Phase 2 implements none of the planned behavior above.
