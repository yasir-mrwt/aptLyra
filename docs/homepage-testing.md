# Homepage and interview acceptance

Use the existing setup to run frontend on `http://localhost:5173`, backend on port 5002, and the AI service on port 8000. The backend needs its configured PostgreSQL/Redis. Do not run destructive tests against shared databases.

## Public homepage

1. Open `/` signed out. Verify the new heading, font, video-conversation illustration and footer `© 2026 Aptlyra. All rights reserved.`.
2. Watch the animation finish one cycle. Use **Replay**, **Pause**, and **Play**. Scroll it offscreen and back; it should pause offscreen. Switch tabs; hidden tabs should not keep animating.
3. Enable your system/browser **Reduce motion** preference and reload. The same illustration should appear as a static image, with no play control. Block the animation JSON in developer tools and reload; the static image should remain.
4. Check the visible animation creator and license links. Open Login and Join from the retained navbar and homepage. **Plan a technical interview** should scroll to and focus the setup section; signed-out users get a real sign-in/join path.
5. Resize to 320, 390, 768 and 1440 pixels. Check text, illustration, menu, form and footer without sideways scrolling. The product currently uses a dark theme; a light system preference does not create a separate light theme.

## Signed-in planning

1. Sign in. Check the three shortcuts: **Plan your practice**, **Share a question**, and **Revisit your practice**. A verified reviewer sees **Review questions** instead of the third shortcut. These links must not change account roles; Team Access remains governed by existing permissions.
2. In **Set the scene**, choose Full Stack Developer, Mixed, 3 questions, 30 minutes, and JavaScript or Python. Junior scope and English remain explicit.
3. In **Choose your focus**, select DSA and Programming. Try deselecting all topics and previewing: validation must explain the problem. Select valid topics again.
4. In **Make each attempt count**, try Fresh first, Only new to me, and Revision practice. Each selection has its own help text. Reload and confirm saved language, topics and repetition policy remain.
5. Open **Optional context** using a mouse and then the keyboard. Company/date fields appear only when the backend reports eligible source context. Unavailable company/resume/JD options must remain honestly described.
6. Select **Preview interview plan**. It should show preparation and prevent repeated submits, then open the real preview. Counts depend on your history. Only-new shortages must block confirmation; errors should permit retry without discarding choices.

## Interview regression flow

1. Confirm an available plan. Wait for the workspace; the timer should begin when usable. Reload and check that the same questions and activation time remain.
2. On a coding question, write code and an explanation separately, then reload to verify drafts. Try JavaScript/Python **Run code**. Use **Run verified tests** only when offered; standalone output is not proof of correctness.
3. Submit an answer, read its feedback, and wait for accepted work to finish. Select **Finish Session → Finish**. Verify visible progress and the saved report.
4. Check individual scores versus reviewed coverage. Download **Report Card PDF** and use **Export Report**; inspect the logo, wrapped explanations/code and every page.
5. Open **History** and reopen the report. Follow **Rank** and account-menu Analytics; unsupported global ranking must remain unavailable.
6. Use the existing authorized reviewer account to inspect the editorial shortcut and queue. Normal users must not gain reviewer or role-management privileges. Review/approval continues through the existing explicit human workflow.

## Authentication and CI

Use [the Google configuration checklist](runtime-acceptance.md#google-sign-in-configuration) for an actual Google popup check. Automated mocks/test cookies are not evidence of a successful provider callback. Also check normal email login/logout and physical microphone/speaker behavior on your device.

The Windows fixture fix uses a native absolute `tmp_path` child and checks production environment precedence. On an authorized subsequent push, inspect **Python AI Service Checks** (`windows-latest`, Python 3.11) in CI. Locally run from `ai-service/`: `.venv/bin/python -m pytest tests -q`. No Windows execution is claimed from a macOS-only run.
