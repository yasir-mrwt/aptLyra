# XP activity ranking

Rank displays total persisted XP, public alias and level for explicitly opted-in participants. XP measures participation, not verified technical skill. Existing reviewed-rubric eligibility, evaluations and report scores remain separate and unchanged.

The source is `gamification.xp`/`level`, falling back to the historical user totals only when no gamification record exists. Totals include answer/completion and achievement rewards. The reward ledger is not summed as a replacement: it does not contain every historical/badge award. The durable runtime uses unique `(session_id, reward_key)` entries and transactional XP updates; legacy completion and buffered XP use locks and duplicate-submission guards. No awards or scores are rewritten by reading Rank.

Existing explicit alias/consent preferences are retained. The legacy default-on gamification flag is not consent. Only the authenticated owner can change their preference; public entries contain rank, alias, level, XP and a viewer-relative `self` boolean. Equal XP shares competition rank (1, 1, 3). Internal account UUID ordering makes ties stable without exposing identifiers. The endpoint returns the top 100 plus the viewer when outside that range; ranking considers all participants.

Leaderboard GETs share the account-scoped, 45-second summary cache. Successful consent/alias/session changes and worker completion/reconnect invalidate it. Unrelated profile/editorial writes retain it. Focus rechecks freshness, and event bursts are coalesced. Existing rows remain during refresh; unsaved preference edits are retained. There is no polling. Another participant's changes become visible on the next focus/navigation after cache expiry.

## Manual checks

1. Sign in and open Rank. On desktop, progress and leaderboard sit side by side; at phone width they stack. Confirm the activity disclaimer and Rank/Alias/Level/XP columns.
2. With a nonparticipating account, enter an alias and explicitly check participation. Save. Your row is highlighted and XP matches your progress card. Never enter private details as an alias.
3. Change the alias and save. Uncheck participation and save: your public row disappears. Refresh and confirm the preference persists. Check from a second consenting test account; it must not see your private name, email or identifiers.
4. Complete an interview, return to Rank and confirm the persisted XP refreshes. Reopening a completed report must not award XP again. Focus the tab repeatedly: valid data stays visible and fresh reads are deduplicated. Log out and switch accounts; preferences and the highlighted row must follow the new account.
5. In a new interview, submit one answer and leave another unanswered. Click Finish Session. Verify the unanswered count and warning. Tab between the two buttons; Shift+Tab wraps, Escape returns, and page scrolling is locked while the dialog is open.
6. Choose **Review unanswered**: return to an unanswered question, with accepted answers still locked. Open Finish again and choose **Finish without answering**: finish once and open the report; unanswered questions remain skipped, with existing timer/scoring behavior. Repeat at phone width.
