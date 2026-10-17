# Aptlyra manual demo checklist

Use the configured local services: frontend `http://localhost:5173`, backend `http://localhost:5002`, AI service `http://localhost:8000`. From their respective directories, run `npm run dev`, `npm run build && npm start`, and `.venv/bin/python -m uvicorn main:app --port 8000`. Keep credentials in local environment files. Use test accounts and synthetic content.

## 1. Homepage and sign-in

1. Open the homepage at desktop and mobile widths. The mobile order is headline, animation, then two equally sized action buttons. There should be no horizontal scrolling.
2. The animation loops onscreen. Scroll it out of view or change tabs: playback pauses. Enable reduced motion: a static illustration appears. Keyboard users can focus the illustration and press Space to pause/resume.
3. Sign in with email, reload, then navigate between pages. You should remain signed in. Separately test real Google sign-in and Join with your own Google account; never share credentials with a test harness.
4. Check that footer copyright and animation/license links remain present.

## 2. Submit and review a question

1. Sign in as an ordinary user. Click **Share a question**, enter a question, confirm your right to share it, and choose whether to allow AI processing. Submit once.
2. Expect a review confirmation and a history entry. Ordinary users must not see approval controls or access another user's submissions.
3. Sign in as an authorized reviewer. Open **Review Queue**, locate the question, and click **Analyze with AI** only when consent is available.
4. Review/edit question, topic, difficulty, mode, suggested answer and checkpoints. Weights must total 100%. **Save draft** must leave it unpublished.
5. After a genuine human review, choose **Approve for practice**. Wait for indexing. A failure should offer **Retry indexing**, without another approval.
6. Find the exact question in **Interview Bank**. Without approved technical evidence and a version-bound scoring guide it must say provisional practice, not reviewed numerical scoring.
7. Where permitted evidence exists, expand the question's scoring guide, review the draft, save any edits, then approve that saved version. Unsaved edits cannot be approved. Advanced details hold references, hashes and indexing information.

Synthetic sample:

> A checkout API receives the same purchase request twice after a client timeout. How would you use a PostgreSQL transaction and an idempotency key to avoid charging twice and prevent inventory becoming negative?

Suggested answer: persist a unique idempotency key and replay the saved result; atomically create the order and conditionally decrement stock; coordinate external payment calls with provider idempotency and a durable outbox. SQL rollback alone cannot reverse an external charge. Suggested practice weights: idempotency 40%, atomic inventory/order updates 40%, payment coordination 20%. These suggestions are not a reviewed technical source.

## 3. Planner and interview

1. Choose a role, topics, difficulty, count, duration and language. Clear all topics or the count, reload, and confirm the incomplete draft survives. Restore valid values.
2. Preview each repetition policy: **Fresh first**, **Only new to me**, **Revision practice**. Only-new must show a shortage and prevent confirmation when insufficient new questions exist.
3. Confirm a valid plan. The clock begins when the workspace is ready and must not restart on reload.
4. For an oral answer: **Record → Stop/transcribe**. Read the transcript, edit it, try recording again, or cancel. No evaluation should occur before **Confirm and submit**. Confirm once; the stored answer must match your final text.
5. Test microphone denial and transcription failure: typed answers remain available. Real microphone and speaker quality require a physical-device check.
6. For a coding question, choose JavaScript or Python, enter code, run available tests, and add a separate explanation. Confirm both are preserved in feedback. SQL questions keep SQL; objective tests may be unavailable for some questions.
7. Wait for each evaluation before submitting another answer. Check failures show recovery rather than an invented score.
8. Once the last answer is accepted, the clock freezes. Click **Finish Session**, confirm Finish, and wait for the saved report. Refresh while finishing; answers must survive and completion must happen once.

## 4. Report, PDF, History and Rank

1. Compare final answer text, code, explanation and per-question status in the web report and PDF/print output.
2. The **individual practice summary** averages only actual numeric scores. Missing/provisional answers do not become zero. The reviewed aggregate remains separate and may be unavailable.
3. Open History: the session is Completed and its report link works. Check long answers/code wrap in PDF.
4. Open **Rank**: XP/level, earned achievements and a UTC calendar of retained completed interviews appear. Global skill ranking remains explicitly unavailable.
5. Open **Analytics**: topic performance remains available and no résumé processing panel appears.

## 5. Résumé recovery

1. Save the following as a `.txt` file and upload it in Resume Analyzer:

   ```text
   DEMO CANDIDATE — SYNTHETIC RESUME
   Junior Backend Developer
   Skills: Python, JavaScript, PostgreSQL, Git, REST APIs.
   Education: BSc Computer Science, Demo University, 2025.
   Project: Built a fictional inventory API with transactions and unit tests.
   Experience: Academic team project only; no professional employment claimed.
   Contact: demo@example.invalid
   ```

2. Navigate away during processing, return, and refresh. The saved upload should reconnect without reuploading. Only the current account's job should be restored.
3. Wait for Completed. Check the result against the synthetic résumé; it should not invent employment, contact details or unsupported findings.
4. If processing fails, use **Retry saved processing**. Connection loss should show recovery, not silently lose the upload. Repeated clicks must not create duplicate active queue jobs.

Provider availability affects timing and evaluation success. Do not treat a provisional score, missing evidence, an unavailable execution test or a failed provider request as a verified skill result.
