# Post-repair polish acceptance

Use the existing development stack and test accounts. No migration or dependency update is required by this repair. Start the configured backend/worker, AI service and frontend as usual. Do not apply these tests to production data.

## 1. Homepage guide, navigation and account

1. Logged out, find **How Aptlyra works**: four numbered/icon cards explain planning, Lyra voice/text, optional coding and feedback. **Get Started** opens registration. Sign in: the same guide remains visible and **Start an Interview** focuses the existing planner. Check four desktop columns, two tablet columns and a mobile stack. Use Tab/Enter on the CTA and enable reduced motion.
2. At desktop width, use **Share a Question** in the header. It opens the normal submission form. Check the same entry on the homepage and mobile navigation.
3. At a mobile width (around 390 px), open navigation, then your account. The page behind the account dialog must remain still. Scroll inside the dialog if necessary. Escape, the close button and backdrop dismiss it; page scrolling returns.
4. Tab through the account controls. The preferred-role select supports keyboard selection and has room for its arrow. Save a deliberate test profile edit and verify it persists.
5. Check the single footer on Home, History, Analytics, Rank, submission and editorial pages. **Legal notices** and **Animation credits & license** open the notices. There is no footer in the active interview.

## 2. Bank loading, caching and review

1. Sign in as an enabled, linked reviewer and open **Editorial Review** with DevTools Network open. A cold load shows a loading message rather than zero inventory. Main inventory loads without fetching the optional scoring tools.
2. Read the starter/new/total counts and the separate scored-interview eligibility explanation. Practice approval is not approval of a scoring guide.
3. Navigate to Analytics and back within 45 seconds. Counts should return from memory without another bank GET. Hard reload fetches again. After expiry, the last valid snapshot remains visible while a fresh request runs.
4. Open **Improve scoring quality**, or a question's **Review scoring guide**. The optional tools load then. An API failure remains visible with retry; it must not fabricate inventory.
5. In **Review Queue**, create/edit a synthetic question, save its draft, and check the refreshed list. Run AI review if consent permits it. Review can take about 20 seconds with the configured local model; do not click repeatedly. Inspect the saved suggestion and make your own decision. AI never supplies human approval.
6. Publish only content you actually reviewed and have rights to publish. Confirm changed counts on return to the bank. Approval, publication and draft changes invalidate cached editorial lists. Scoring readiness still requires the existing exact-version evidence workflow.
7. Log out and sign in as a normal user. Reviewer controls and protected APIs remain unavailable; no reviewer inventory should leak through cached state.

## 3. Interview, Analytics and session recovery

1. Create a short interview, submit one answer and leave another unanswered. Exercise Skip, return to the question and reload: drafts survive and accepted answers stay immutable.
2. Finish the interview, review the unanswered confirmation, then finish. Open Analytics immediately: saved individual practice data should appear without a transient invalid-token message.
3. To test expiry in development, leave the tab idle beyond the access-cookie lifetime (15 minutes), then navigate to an uncached protected page. Network may show an initial 401, followed by one successful refresh and a successful replay. The page should not briefly display that recoverable error. A revoked/expired refresh cookie must still require login; a normal user must still receive 403 for reviewer actions.
4. Change to another test account. History, Analytics, submissions and bank data must belong only to that account.

## 4. Reports, History and PDF

1. The report emphasizes the individual practice mean, scored-answer count and unanswered count. Missing scores say **Not available**; an actual stored zero remains zero.
2. Expand **Scoring methodology** for reviewed aggregate, coverage and provisional/abstained details. An individual score does not imply eligibility for the reviewed aggregate.
3. Return to History: check the same hierarchy. **Open report** opens the original report; Delete opens its confirmation without opening the report.
4. Download **Report Card PDF** and compare scores, counts and feedback with the screen.
5. For a coding answer graded without a test run, expect **Evaluated by code review · Execution not run; no test result recorded**. For actual execution evidence, expect its saved passed/failed result. Neither screen nor PDF may invent test success.

## 5. Rank

1. On desktop, activity/XP/calendar and leaderboard sit beside each other; on mobile they stack without horizontal scrolling.
2. Enter a public alias and explicitly opt in, save, change the alias and opt out. The leaderboard refreshes after each successful save. It must never opt you in automatically.
3. Complete an interview and return to Rank. XP/calendar and the activity leaderboard refresh. Rank shows total earned XP, public alias and level for consenting participants; equal XP shares rank. This is activity, not a verified technical-skill comparison. Reviewed-rubric eligibility remains separate.

## 6. Preserved flows and external checks

1. Exercise JavaScript and Python execution, speech record/transcribe/edit/confirm, timed finish and refresh during processing using the existing demo acceptance guide.
2. Upload a synthetic résumé; verify durable analysis/recovery without a job-description field. It must not enter interview Analytics.
3. Google: use the exact registered scheme/host/port, open the real Google popup, complete the callback and reload. Record whether a COOP warning coincides with an actual failure. Do not disable security headers to remove warnings. OAuth console allowed origins and physical microphone/speaker behavior need the real account/device; automated fixtures cannot certify them.

See [demo repair acceptance](demo-repair-testing.md) for the full preserved interview/editorial/resume scenarios. Run frontend tests/lint/typecheck/build, backend tests/lint/typecheck/build and disposable integration suites before release. This change is committed locally only; it is not a deployment or Windows CI run.

## Google development-origin repair

The read-only check on 18 October 2026 received a valid challenge (HTTP 200), but Google returned: “The given origin is not allowed for the given client ID.” No callback was completed.

1. In the Google Cloud project that owns the backend-configured OAuth **Web application** client, open **APIs & Services → Credentials → that OAuth client**.
2. Add `http://localhost:5173` to **Authorized JavaScript origins**, preserving the existing valid origins. Use the exact scheme, host and port used by the browser; do not use a wildcard or an origin with a path.
3. Save, allow configuration propagation, reload Login and complete a real Google sign-in. Verify the callback and subsequent session restoration.
4. Keep Helmet/COOP unchanged. The observed blocker is an origin rejection, not evidence that weakening browser isolation is required. The console warning can only be reassessed after the real popup is allowed to initialize.

Reference: [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). Google Cloud client settings cannot be changed from this repository.
