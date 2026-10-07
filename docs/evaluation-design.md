# Evaluation and FYP research design

## CURRENTLY IMPLEMENTED

The baseline asks an LLM for technical and candidate `confidence_score` values
between 0 and 100, feedback and an ideal answer. The session summary weights the
two scores equally and treats unevaluated questions as zero when manually ended.
Speech measurements may be available or explicitly unavailable. No stored reviewed
rubric, concept evidence, evaluator confidence, calibration, or scoring-quality
study exists. Phase 1's provider fixtures verify contracts/failures, not AI quality.
This document changes no current scoring behavior.

## PLANNED FOR LATER PHASE: three separate meanings

| Output | Meaning | Aggregation rule |
|---|---|---|
| Technical performance | Demonstrated correctness, concepts and reasoning against a pinned question rubric | Only eligible technical dimensions contribute to a technical score |
| Candidate delivery confidence | Optional descriptive speaking/delivery feedback; observed pace/pauses and clarity, with measurement availability | Separate panel; never added to technical performance; no personality/accent inference |
| Evaluator confidence / evidence sufficiency | Categorical judgment that this evaluation has an adequate rubric, answer and reference basis | Separate `high`/`medium`/`low` plus reasons; never a candidate score or multiplier |

Avoid “confidence” without its subject in the UI/API. Existing candidate confidence
values remain labeled legacy delivery feedback. Neither LLM self-confidence nor
speaking pace is a calibrated probability of correctness. Missing audio measurements
do not prevent valid text-based technical evaluation.

## Rubric dimensions and score contract

Use six explainable dimensions, tailored to junior knowledge rather than the
reference application's research-role metrics. Each dimension has a finite 0–4
value, anchors, evidence references, applicability, and a pinned weight. Anchors:
0 absent/incorrect, 1 major gaps, 2 partially sound, 3 substantially correct with
minor gaps, 4 correct and appropriately justified. Values between anchors are
permitted only with an explicit rubric rule, such as weighted concept coverage.

| Dimension | Evidence being judged | Default technical weight |
|---|---|---:|
| Correctness | Valid facts, outcomes and solution behavior; explicit misconceptions | 45 |
| Concept coverage | Reviewed expected concepts demonstrated, including essential points | 20 |
| Reasoning | Causal steps, algorithm/diagnostic justification, explanation of why | 20 |
| Practical application | Concrete application, implementation or relevant example | 10 |
| Trade-off awareness | Appropriate constraints/alternatives at the question's difficulty | 5 |
| Communication clarity | Understandable technical explanation, independent of accent/fluency | 0; separate descriptive dimension |

These are initial policy weights for later validation, not experimentally proven
weights. An author may mark practical application or trade-offs inapplicable and
normalize the remaining technical weights **before publication/selection**. Reviewed
coding/SQL/design rubrics may set different explicit weights summing to 100; they
must explain the learning objective. No runtime reweighting hides missing evidence.
Communication clarity remains outside the technical aggregate; unclear content may
cause abstention if the evaluator genuinely cannot identify the technical evidence.

For applicable technical dimensions, `technicalScore = 25 × sum(weight × value)
/ sum(weight)` gives 0–100, rounded once to one decimal for display. Reject NaN,
infinity, out-of-range values, unknown concept/source IDs, missing required dimensions,
or inconsistent evidence. If a rubric identifies a fatal misconception/required
invariant and the answer demonstrates its violation, correctness is 0 and the
technical score is capped at 25; publish that rule in the rubric and explain the
cap. This is not a universal keyword penalty.

Expected concepts carry IDs, importance weights, essential/critical flags, acceptable
alternatives, observable anchors and technical reference links. Evidence judgments
are `satisfied` (1), `partial` (0.5), `absent` (0), `incorrect` (0), or `unobservable`.
Concept coverage is `4 × weighted demonstrated fraction`. An unobservable required
concept due to missing/corrupt answer evidence triggers abstention, rather than
quietly removing its weight. Absence from a valid complete answer is an assessable
gap. Correctness measures validity; coverage measures breadth, so an answer can be
factually correct but incomplete. Test outcomes provide facts, not an automatic
grade for reasoning or the entire question.

## Known and provisional rubric paths

| Property | Known rubric | Provisional rubric |
|---|---|---|
| Basis | Published reviewed question version and reviewed concepts/weights/reference evidence | Generated or materially adapted question with retrieved technical references and generated expected concepts |
| Review | Human technical review identity/time, valid references and explicit version | `reviewStatus: provisional`, no invented reviewer/authority; validation is not human review |
| Confidence ceiling | High is possible when all evidence gates pass | Medium maximum until reviewed |
| Score display | Technical score with confidence and evidence reasons | Optional “Provisional practice estimate”; separate from reviewed totals |
| Promotion | New version on changes; old evaluations stay pinned | Human review creates a new reviewed version; no retroactive relabeling |

Rubric status depends on the exact question version. Retrieval alone does not make
a rubric known. An unchanged reviewed fallback seed can be known; a changed question
cannot inherit authoritative concepts without checking that its requirements are
unchanged. A purely cosmetic editorial change requires explicit equivalence review.
Interview-experience reports may suggest questions but cannot serve as the sole
technical reference for a provisional rubric.

Future persisted/API fields: question/rubric/concept versions, review status,
reviewer/date where applicable, dimensions/weights, `scoreStatus: scored | abstained`,
nullable `technicalScore`, `evaluatorConfidence: high | medium | low`, reason codes,
evidence IDs and independent `delivery` availability/measurements. Pending/failed
processing is an operation state, not an abstained or zero-scored evaluation.

## Confidence gates and abstention

| Level | Required evidence interpretation | Score behavior |
|---|---|---|
| High | Known rubric; readable complete answer/artifacts; valid references covering all required concepts; evidence-backed judgments; no unresolved source/test contradiction | Reviewed score allowed; high means strong basis, not guaranteed correctness |
| Medium | Readable answer and adequate technical evidence, but a provisional rubric or documented noncritical ambiguity/limited checks; all mandatory judgments still supported | Known score with caveat, or separate provisional estimate |
| Low | Missing required evidence, unsupported concepts, conflicting references/checks, unreadable artifact, or unverifiable model output | Withhold score; return reason and actionable retry/clarification/unscored feedback |

Confidence is computed by observable gates and reason codes, not a second LLM's
unexplained certainty. Weak answers can have high-confidence low technical scores.
Strong-looking answers with insufficient grounding require low-confidence abstention.
Record model/prompt/scoring policy, retrieval snapshot, test capability, artifact
availability and applicable gate results for repeatability and later human review.

STT/HTTP failure is retryable processing failure. A valid “I do not know” or clearly
incorrect submitted answer may score zero with sufficient evidence. A skipped,
unanswered, corrupted or failed-processing item has no score. Never fabricate a
fallback grade from keyword matching or an unavailable test runner. After one
bounded correction of invalid model output, return a failed operation or abstention
with an explicit reason; do not loop until a plausible score appears.

## Aggregation, follow-ups and recommendations

1. Compute reviewed original-question means within each primary competency. Only
   scored known rubrics with high/medium evidence confidence are eligible. Display
   eligible/planned counts, skips, failures and abstentions alongside each mean.
2. Overall reviewed performance is the equal-weight mean of eligible competency
   means, only if every selected root has at least one eligible original, at least
   two originals are eligible, and at least 60% of planned originals are eligible.
   Otherwise show “insufficient reviewed coverage” and per-question results. A
   single-topic interview can qualify with two eligible originals. Do not imply
   cross-role comparisons or fill missing roots with zeros.
3. Provisional estimates are separate per-question/competency observations; they do
   not enter the reviewed overall. Display provisional and reviewed sample counts.
4. Follow-ups probe a missing concept without recursive probes or score inflation.
   Preserve original scores; report the clarified concept evidence separately.
   Follow-ups do not increase the overall denominator or overwrite the first answer.
5. Recommend specific practice for reviewed missing concepts, weighted by importance
   and repeated observations. Distinguish provisional suggestions and unassessed
   topics. Link permitted references, not an unsupported “hireability” score.

Pin scoring versions in reports and PDFs. Historical equal-weight technical/delivery
scores remain legacy; no conversion into new competency/evaluator-confidence scores.
Visibility, Lyra behavior, question types and evidence lineage are defined in
[the target architecture](target-architecture.md).

## FYP evaluation protocol (future work)

No final research study or live-provider quality evaluation is performed in Phase 2.
Phase 11 will freeze test data, corpus, model/prompt versions and scoring policy
before measurement. Phase 7 uses a separate development set to tune anchors/gates;
do not tune thresholds on the final held-out set. Prefer authored or consented,
de-identified data. Publish dataset coverage and exclusions; small FYP samples cannot
support population-wide fairness or hiring-validity claims.

| Area | Planned data | Measures and analysis |
|---|---|---|
| Retrieval | At least 40 labeled queries across roles/roots/difficulty and company/date filters, plus 10 no-evidence/outage cases; approved corpus with known dates | Precision@5 = relevant hits in the first five / 5 (missing positions count as nonrelevant), precision among returned hits, coverage/empty rate, graded relevance, duplicate rate, freshness accuracy and filter violations; zero permission/filter violations required |
| Scoring | Target 60 reviewed questions across eight roots and six categories, with three authored/consented weak/partial/strong answers each; 12 generated/adapted provisional cases with human reference rubrics withheld from the model; two independent human raters plus adjudication; 20 additional insufficient/conflicting evidence cases | Human inter-rater agreement first; model-human MAE on the 0–100 scale, per-dimension difference and Spearman rank correlation within comparable rubrics/categories; report reviewed and provisional separately, denominators and uncertainty |
| Consistency | Same answer/rubric/evidence repeated three times on a stratified subset of at least 30 answers; recorded provider/model settings | Range/standard deviation, score-status/confidence agreement; no claim of deterministic cloud inference |
| Monotonicity | Paired strong/weak answers for each reviewed question, with expected ordering independently checked by humans | Fraction strong > weak; ties/violations and causal examples, including contradictions/keyword gaming |
| Confidence/abstention | Human adequacy labels on normal and the 20 insufficient-evidence cases | Error by confidence level, low-confidence detection/false withholding, coverage vs selective MAE; categories are not probability calibration |
| System | At least 30 scripted full sessions over core modes; normal, empty retrieval, delayed provider, disconnect, restart, duplicate and storage-failure scenarios | Per-stage end-to-end p50/p95, queue/provider split, failure/retry rate, completed/started rate, duplicated side effects and recovery outcome |
| User study | Planned 15–20 voluntary final-year/junior participants, consented tasks covering oral/mixed and optional modes when available | 1–5 usefulness, realism, clarity, trust in feedback and usability questions; task completion, observed friction, brief qualitative interviews; report sample and raw distributions |

Report returned count and shortfall alongside Precision@5 and returned-hit precision
so systems cannot improve apparent relevance by hiding most results. Recency uses occurrence
dates for interview reports and explicit reference version dates for technical
documentation; missing dates are unknown. Human relevance judgments should be
blinded to retrieval rank where practical. Scoring raters see the reviewed rubric
and answer, not the model score; adjudication records disagreements. Rank correlation
is descriptive and omitted when sample size or score variation makes it meaningless.

Use the same frozen questions/answers to compare the baseline prompt-only technical
evaluation with the reviewed evidence/rubric path. A bounded no-retrieval ablation
can test grounding's contribution without changing the held-out set. Report common
eligible cases and failures separately; do not compare legacy technical/delivery
averages with the new technical score. Provisional cases get independent human
reference concepts for measurement, while the model sees only its provisional
concepts and retrieved evidence; that human reference does not silently promote
the evaluated rubric to known status.

Initial engineering acceptance targets: zero out-of-range grades, fabricated
citations, duplicate completion rewards, or permission/filter bypasses in controlled
tests; correct retry/abstention for every specified failure fixture. For the held-out
quality study, provisional goals are reviewed-score MAE ≤10/100, strong>weak on
≥90% of pairs, and Precision@5 ≥0.8 where eligible evidence exists. These are goals,
not results or promises; report unmet targets and category breakdowns honestly.
Latency goals are in [target architecture](target-architecture.md). Do not hide
failed sessions from completion statistics or exclude abstentions from coverage.

Required later artifacts: source permission/review manifest, frozen relevance labels,
rubric/answer benchmark, rater/adjudication records, consent and de-identification
log, model/prompt/corpus revisions, machine/runtime description, per-operation timing
and error records, study questionnaire, anonymized outcomes and limitations. Research
exports contain no raw identifying resume/audio data and do not enter the public
repository without separate participant permission.

## Phase 7 implemented policy

The Phase 2 sections above preserve design/research context. The authorized Phase 7 runtime freezes all five 0–4 dimensions at 45/20/20/10/5 weights; authored weight overrides, dimension omission and a universal 25-point fatal cap are not implemented. Express calculates the one-decimal 0–100 total and weighted concept coverage; SQL checks it. Objective execution failure forces correctness to zero with an explicit reason. Communication remains descriptive only.

Reviewed/provisional/abstained paths, immutable human hash review, approved-reference-only grounding, categorical evaluator confidence and nullable aggregate gates are now implemented for fresh planner confirmations. Provisional/derived evaluation is at most medium; low confidence abstains. Reviewed aggregates use at least two eligible originals, at least 60% original coverage and every planned root, weighting root means equally. No legacy score substitutes for missing evidence. Historical sessions keep legacy policy. Live feedback reveals judgments/labels and concise explanations after submission, not private expected descriptions, excerpts or ideal answers. See [rubric evaluation](rubric-evaluation.md). No Phase 11 research, human agreement study or confidence calibration has run.
