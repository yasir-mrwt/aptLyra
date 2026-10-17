# Demo repair acceptance guide

Use a development environment and test accounts. Keep production credentials out of test commands. Do not publish real content without its human review and publication rights.

## Prepare

1. Use Node 20.19+, install the existing lockfiles, and build backend/frontend.
2. Apply migrations with `npm run db:migrate` from `backend/` against your intended **development** database. Migration 017 adds explicit leaderboard consent and aliases; migrations 001–016 are unchanged. Restart the backend and frontend. This repair does not apply migrations to a cloud database or deploy anything.
3. Start the AI service and configured Redis workers. Use the browser URL registered for Google sign-in, including its exact scheme and port.

## Homepage and mobile

1. Visit the homepage on desktop and at approximately 390 px width. Check headings, buttons, and absence of horizontal overflow.
2. The hero has no visible credit sentence. Open **Animation credits & license** in the footer; attribution and the Lottie license remain accessible.
3. Open mobile navigation. Scroll within it; the page behind it must stay still. Links are centered. Close it or press Escape; page scrolling must return.
4. Check Login, Rank, Analytics, Resume Analyzer, Share a question and Interview Bank headings and body text.

## Plan, skip, submit and finish

1. Choose a junior role, topics, oral/mixed/coding mode, JavaScript or Python, count and duration. Leave **Allow provisional practice questions** off. Preview uses trusted starters or exact-version reviewed guides.
2. If inventory is insufficient, broaden your setup or explicitly enable provisional practice. That option permits feedback without a numeric score; it never bypasses Only new to me.
3. Confirm a plan. Type an answer, choose **Skip for now**, then click its numbered question to return. Reload: the unsent draft must remain.
4. For speech: record, stop/transcribe, edit the transcript, or use Record Again. Confirm and submit only when ready. For coding: run code and include an explanation.
5. After submission, return to that question: its submitted content is visible but cannot be edited, including after processing failure/cancellation. Retry eligible processing using the operation controls; a retry evaluates the same accepted answer.
6. Leave at least one question unanswered. Click **Finish Session**. Check the dark dialog and unanswered count. **Review unanswered** returns to an unanswered question. **Finish without answering** creates the saved report without inventing scores.
7. Repeat with every answer submitted: elapsed time freezes after durable acceptance of the final answer. Finish prepares the existing report. Refresh while processing to check recovery.
8. Read each answer's status, the individual practice summary and the separate reviewed aggregate. Download the PDF. Intentionally unanswered items must have no fabricated grade.

## History, Analytics and cache

1. Open History: check the individual mean, scored/provisional/unanswered counts and original report link.
2. Open Analytics: the individual-practice section includes saved scored answers from newer interviews; reviewed aggregates stay separate. An account with no scores shows an honest empty state.
3. Navigate between Rank, Analytics and History. In DevTools Network, repeated summary GETs within 45 seconds should be reused. A hard reload fetches again.
4. Complete another interview, then revisit History/Analytics: the completion invalidates the summary cache. Deleting a session, approving a question or changing résumé jobs also invalidates relevant reads.
5. Log out and sign into another test account. No first-account records, drafts or cached summary should appear.

## Rank and privacy

1. Open Rank: check the retained activity calendar, earned XP, levels and achievements.
2. Enter a public alias and explicitly opt in. Do not put private details in the alias. An account without qualifying results explains why it has no position.
3. Qualifying comparisons require at least three original questions, every one scored with an exact reviewed rubric and adequate evaluator confidence. The same role, question versions, rubric versions, evaluator/prompt/scoring versions and coding language form a group. Trusted starter grades alone do not qualify.
4. With two qualifying test users in the same group, confirm actual saved means and ties. Each user's latest interview in that group counts, not their best attempt. Equal rounded means share competition rank (1, 1, 3). Different question sets are separate groups. These are practice comparisons, not professional certification.
5. Change your alias, save, and reload. Opt out: your row disappears. Real names, email addresses, session IDs and account IDs are never listed.

## Share a question and reviewer flow

1. As a normal user, use the homepage or mobile navigation **Share a question** entry.
2. Confirm sharing rights and choose AI-processing consent separately. Submit a locally authored question. A normal account must not see reviewer controls or access reviewer APIs.
3. As the linked reviewer, open Interview Bank. Edit topic, difficulty, answer and checkpoints totaling 100; Save Draft before approval. Advanced details contain hashes/reference plumbing.
4. Human practice approval and evidence-supported scoring-guide approval are separate. Use disposable fixtures for publication checks. AI suggestions never approve themselves; missing evidence keeps scoring provisional.
5. After an appropriately authorized publication, confirm the bank state and fresh planner preview. Only an exact-version reviewed scoring guide changes scoring readiness.

## Résumé

1. Upload a test PDF/DOCX/TXT under the size limit. There is no Job Description input or Job Match tab.
2. Follow queued → extracting → analyzing → completed states. Refresh or navigate away and return: the saved job recovers without uploading again.
3. Check extracted skills, ATS feedback, insights and useful suggestions. Visit Analytics: résumé progress must not appear there.
4. Test with a second account: it must not access the first account's job. A failed job offers recovery rather than an invented result.

## Automated checks

Run frontend `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; backend `npm test -- --runInBand`, `npm run lint`, `npm run typecheck`, `npm run build`. With `docker compose -f compose.test.yml up -d`, run backend schema, ingestion, evaluation, planner, durable, persistence, content E2E, runtime E2E and smoke suites. Run `node --test tests/practice-leaderboard.test.mjs`. From `ai-service/`, run `.venv/bin/python -m pytest tests -q`. End with `git diff --check`.

Windows, actual Google popup completion, physical microphone/speaker behavior and external AI latency require their respective real environments; disposable provider tests do not prove those checks.
