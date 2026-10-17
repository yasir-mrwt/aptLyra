# Reviewed practice comparisons

Participation defaults to off in `practice_leaderboard_preferences`, independently of the legacy XP opt-in setting. Users choose an alias of 2–32 letters, numbers, spaces, underscores or hyphens. GET/PUT `/api/gamification/leaderboard` are authenticated. PUT changes only the caller's preferences. GET now returns `{policy, preference, reason, groups}`, replacing the former XP array; all frontend consumers use the new contract.

Each comparison group has identical role, original question versions, rubric versions, scoring policy, evaluator model/prompt versions and answer language. Follow-ups are excluded. At least three distinct original questions must all be evaluated, reviewed, scored in [0,100], and have confidence above low. Provisional, abstained, unanswered and trusted-baseline-only results cannot qualify.

One result per opted-in user per group: latest saved completed report, with session ID as a deterministic timestamp tie-breaker. Score is the arithmetic mean of the original question scores rounded to one decimal. Equal means share competition rank (1,1,3). Alias and internal session ID provide stable display ordering only, never a tie-breaking score advantage. No public account IDs, email addresses, real names or session IDs are returned. Changing an alias or opting out applies on the next read.

Groups with a single participant are explicitly awaiting peers. Different groups do not imply a common rank. Historical reports are not rewritten, and evidence withdrawal does not silently rewrite an issued historical grade. These are practice comparisons rather than a certification or a population-wide skill assessment.

The current query reads opted-in completed report snapshots. At large scale, move qualification to an indexed materialized projection; do not truncate candidate inputs and silently change ranking semantics. Pagination and eligibility revalidation of historical withdrawn sources remain future product decisions, not claims made by this release.
