# Interview runtime and acceptance checks

Aptlyra uses a pinned interview plan. Confirmation freezes its questions; `POST /api/sessions/:id/activate` records the server's activation time after the workspace is usable. Activation is owned and idempotent. Reloading retains that timestamp. Migration `016_interview_activation.sql` adds the activation fields without rewriting historical sessions. Apply migrations before starting the updated backend.

The planner retrieves one complete eligible pool and allocates across the requested competencies. Bulk snapshot writes reduce network round trips without bypassing publication, provenance, duplicate, ownership, or rubric checks. Only-new shortages remain shortages; revision practice may repeat prior questions. Timings contain numeric durations/counts and a bounded request ID, not answers, credentials, or SQL.

## Run code and verified tests

Run code sends JavaScript/Python to the existing isolated JDoodle provider. It reports output and runtime status; success is not proof of answer correctness. Optional design workspaces have the same distinction. Run verified tests appears only for exact-content-bound trusted exercises. Supported contracts include binary search, first repeated value, consecutive-character removal, and grouping words by length. The latter two use `removeConsecutiveRepeats(text)` / `remove_consecutive_repeats(text)` and `groupWordsByLength(words)` / `group_words_by_length(words)` respectively. JavaScript grouping accepts a Map or a plain object of arrays.

Code and typed explanation remain separate. Baseline evaluation receives both and only matching code/language execution evidence. AI feedback is fallible; no score is forced to 100. Dynamic scoring guides remain drafts until an authorized reviewer approves the exact version. A starter's individual score does not establish eligibility for a reviewed aggregate.

## Google sign-in configuration

The login/join pages obtain the public client ID and a signed-cookie-bound nonce from `GET /api/user/google/challenge`. The backend's `GOOGLE_CLIENT_ID` is authoritative; the frontend no longer selects an independent Vite client ID. `POST /api/user/google` verifies the Google ID token's audience, verified email, identity, and nonce. Existing Gmail/Workspace accounts may link by authoritative email; other existing email accounts must use their existing login. Roles are never supplied by the Google payload.

For a live callback check:

1. In Google Cloud, use a **Web application** OAuth client matching backend `GOOGLE_CLIENT_ID`. Add `http://localhost:5173` and the exact deployed HTTPS frontend origin to Authorized JavaScript origins. Ensure consent-screen/test-user access permits your account.
2. This integration uses the Google Identity Services credential popup, not an application authorization-code redirect. It posts the credential to `/api/user/google`; do not invent a redirect callback URL. If deployment changes to a redirect flow, configure that separately.
3. Keep `JWT_SECRET` private and stable. Set backend `FRONTEND_URL` to the exact allowed frontend origin(s). Use backend port **5002** and frontend API base `http://localhost:5002/api` locally. Local HTTP uses `NODE_ENV=development`; production needs HTTPS for Secure/SameSite=None cookies. Check browser privacy settings if third-party cookies are blocked.
4. Restart the backend after configuration changes. Open Login, choose Google, complete the actual provider popup, and verify the authenticated homepage. Repeat for Join and an existing account, refresh, sign out, and sign back in. Check cancellation/expired challenge recovery and ordinary email login too.

Automated token-verifier mocks and test cookies do not establish a successful real Google callback. That step requires an authorized human Google session.

## Short manual acceptance flow

1. Start the configured PostgreSQL/Redis dependencies, AI service on 8000, backend on 5002, and frontend on 5173 using the existing setup instructions. Do not point destructive tests at a shared database.
2. Visit `/` signed out. Check Login/Join, mobile menu, theme, hero steps, and reduced-motion mode. Sign in; choose **Plan a technical interview** to focus the real form.
3. Choose Full Stack Developer, Junior, Mixed, DSA + Programming, 3 questions, 30 minutes. Preview Fresh first, Only new to me, and Revision practice. Counts depend on your retained history. Strict shortages must block confirmation instead of silently repeating.
4. Confirm an available preview. The clock starts after the workspace becomes usable. Reload: the same questions and activation time remain. Type code and an explanation, reload again, and confirm both drafts remain.
5. On a coding question, select JavaScript or Python. Run code for output; run verified tests only where offered. Submit the answer and inspect its actual feedback. For design questions, optional runnable code does not imply verified design tests.
6. Wait for accepted work to finish, select **Finish Session → Finish**, and check the visible progress and saved report. Compare individual scores, reviewed coverage, explanations, and execution evidence. Download Report Card PDF and print/export the report; inspect all pages.
7. Open **History**, filter/load more, and reopen the report. Open **Rank** and account-menu Analytics: ranking/verified skills must say unavailable unless supported by authoritative data.
8. For a consented submitted question, use an authorized reviewer account to inspect/edit the proposed rubric, criteria and weights, then explicitly approve the exact content. A normal account must not access reviewer actions.

Physical microphone/speaker behavior must be checked on the target device; headless browser checks do not certify it.
