import {publicEvaluationSession} from "../evaluation/readModel.js";
import {evaluationService,type Prepared} from "../evaluation/service.js";
import type {EvaluationView,ProviderResult} from "../evaluation/contracts.js";
import fs from "fs";
import path from "node:path";
import { sessionRepository, withSessionLock, ISession } from "../models/Session.js";
import { resumeRepository } from "../models/Resume.js";
import { aiService } from "./aiService.js";
import { pushSocketUpdate } from "./socketService.js";
import { gamificationService } from "./gamificationService.js";
import { query } from "../config/db.js";

export class SessionStateError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

async function completeLocked(session: ISession) {
  if (session.status === "completed") return session;
  if (session.status !== "in-progress") throw new SessionStateError("Only active interviews can be completed");
  if (session.questions.some(q => (q.isSubmitted && !q.isEvaluated) || q.followUpPending)) {
    throw new SessionStateError("Evaluation in progress, please wait.");
  }
  const scores = sessionRepository.calculateScoreSummary(session);
  session.overallScore = scores.overallScore;
  session.metrics = { avgTechnical: scores.avgTechnical, avgConfidence: scores.avgConfidence };
  session.status = "completed";
  session.endTime = new Date().toISOString();
  const saved = await sessionRepository.save(session);
  await gamificationService.rewardCompletion(session.user);
  return saved;
}

export const sessionService = {
  async createInterviewSession(
    userId: string | any,
    role: string,
    level: string,
    interviewType: string,
    count: number,
    company: string | undefined,
    companyTrack: string | undefined,
    resumeId: string | undefined,
    io: any
  ) {
    const session = await sessionRepository.create({
      user: userId.toString(),
      role,
      level,
      interviewType: interviewType as ISession["interviewType"],
      company,
      companyTrack,
      resumeId,
      status: "pending",
    });

    // Background process for AI generation
    (async () => {
      try {
        pushSocketUpdate(
          io,
          userId.toString(),
          session._id,
          "AI_GENERATING",
          `Generating ${count} questions for ${role}...`
        );

        let resumeText = undefined;
        if (resumeId) {
          try {
            const resume = await resumeRepository.findById(resumeId);
            if (resume && resume.user === userId.toString()) {
              resumeText = resume.parsedData?.rawText;
              // Or extract projects specifically if you prefer, but rawText gives full context
              if (!resumeText && resume.analysisReport?._v2?.report?.recruiter_summary) {
                resumeText = resume.analysisReport._v2.report.recruiter_summary;
              }
            }
          } catch (err: any) {
            console.error("Error fetching resume for session:", err.message);
          }
        }

        const aiData = await aiService.generateQuestions({
          role,
          level,
          interviewType,
          count,
          resumeText,
          company,
          companyTrack,
        });
        const questions = (aiData.questions || []).map((qInfo: any) => ({
          questionText: qInfo.question,
          idealAnswer: qInfo.ideal_answer,
          questionType: ["coding", "system-design"].includes(qInfo.question_type) ? qInfo.question_type : "oral",
          isEvaluated: false,
          isSubmitted: false,
        }));

        await withSessionLock(session._id, async () => {
          const fresh = await sessionRepository.findById(session._id);
          if (!fresh || fresh.status !== "pending") return;
          fresh.questions = questions as any;
          fresh.status = "in-progress";
          fresh.startTime = new Date().toISOString();
          await sessionRepository.save(fresh);
          session.questions = fresh.questions;
          session.status = fresh.status;
          session.startTime = fresh.startTime;
        });

        pushSocketUpdate(
          io,
          userId.toString(),
          session._id,
          "QUESTIONS_READY",
          "Starting Interview...",
          session
        );
      } catch (error: any) {
        console.error("Error in createSession (Background):", error.message);
        await withSessionLock(session._id, async () => {
          const fresh = await sessionRepository.findById(session._id);
          if (!fresh || fresh.status !== "pending") return;
          fresh.status = "failed";
          await sessionRepository.save(fresh);
        });
        pushSocketUpdate(
          io,
          userId.toString(),
          session._id,
          "GENERATION_FAILED",
          "Failed to generate questions",
          await sessionRepository.findById(session._id)
        );
      }
    })().catch(() => console.error("Question generation task could not persist its result"));

    return session;
  },

  async getSessionsForUser(userId: string | any, page: number, limit: number) {
    const uid = userId.toString();

    const [totalSessions, completedSessionsCount, sessions] = await Promise.all([
      sessionRepository.countForUser(uid),
      sessionRepository.countCompletedForUser(uid),
      sessionRepository.listForUser(uid, page, limit), // Questions excluded for the list view
    ]);

    return {
      sessions,
      pagination: {
        totalSessions,
        totalPages: Math.ceil(totalSessions / limit),
        currentPage: page,
        pageSize: limit,
      },
      stats: {
        totalSessions,
        completedSessions: completedSessionsCount,
        activeSessions: totalSessions - completedSessionsCount,
      },
    };
  },

  async getSessionDetails(sessionId: string, userId: string | any) {
    const session = await sessionRepository.findByIdForUser(sessionId, userId.toString());
    if (!session) {
      throw new Error("Session not found");
    }
    return publicEvaluationSession(session);
  },

  async deleteInterviewSession(sessionId: string, userId: string | any) {
    return withSessionLock(sessionId, async () => {
      const session = await sessionRepository.findByIdForUser(sessionId, userId.toString());
      if (!session) throw new Error("Session not found");
      if (session.status === "pending" && !session.planId) throw new SessionStateError("Cannot delete a session while questions are being generated.");
      if (session.questions.some(q => (q.isSubmitted && !q.isEvaluated) || q.followUpPending)) {
        throw new SessionStateError("Cannot delete a session while evaluation is in progress.");
      }
      await sessionRepository.delete(session);
      return session._id;
    });
  },

  async submitSessionAnswer(
    sessionId: string,
    userId: string | any,
    questionIndex: string,
    code: string | null,
    language: string | null,
    audioFilePath: string | null,
    diagramImageUrl: string | null,
    io: any,
    answerText?: string | null
  ) {
    if (!/^\d+$/.test(String(questionIndex))) throw new SessionStateError("Invalid question index", 400);
    const qIdx = Number(questionIndex);
    if (answerText != null && (typeof answerText !== "string" || answerText.length > 50000))
      throw new SessionStateError("Typed answer must be text of at most 50000 characters", 400);
    const typedAnswer = answerText?.trim() || "";
    if (audioFilePath && typedAnswer) throw new SessionStateError("Choose a recorded or typed answer", 400);

    await withSessionLock(sessionId, async () => {
      const session = await sessionRepository.findByIdForUser(sessionId, userId.toString());
      if (!session) {
        throw new Error("Session not found");
      }

      if (!session.questions[qIdx]) {
        throw new Error("Question not found");
      }

      if (session.status !== "in-progress") throw new SessionStateError("This interview is not active");
      const q = session.questions[qIdx];
      if(session.planId && q.questionVersionId && !(await query("SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND entity_id=$1",[q.questionVersionId])).rows.length)
        throw new SessionStateError("This planned question is unavailable. Create a fresh plan.",409);
      if(session.planId && q.questionType==="coding" && language!==q.language)throw new SessionStateError("Use the planned coding language",400);
      if (q.isSubmitted || q.isEvaluated) throw new SessionStateError("Answer already submitted");
      if (q.questionType === "oral" && !audioFilePath && !typedAnswer) throw new SessionStateError("Record or type an answer before submitting", 400);
      if (q.questionType === "coding" && !code?.trim()) throw new SessionStateError("Code is required", 400);
      if (q.questionType === "system-design" && !audioFilePath && !diagramImageUrl && !typedAnswer) throw new SessionStateError("Provide an answer or a diagram", 400);
      delete q.processingError;
      // Mark as submitted immediately to prevent duplicate submissions
      session.questions[qIdx].isSubmitted = true;
      await sessionRepository.save(session);
    });

    this.evaluateAnswerAsync(
      io,
      userId.toString(),
      sessionId,
      qIdx,
      code,
      language,
      audioFilePath,
      diagramImageUrl,
      typedAnswer
    );
  },

  async evaluateAnswerAsync(
    io: any,
    userId: string,
    sessionId: string,
    questionIdx: number,
    codeSubmission: string | null,
    language: string | null,
    audioFilePath: string | null,
    diagramImageUrl: string | null,
    answerText = ""
  ) {
    let prepared:Prepared|undefined;
    try {
      const session = await sessionRepository.findById(sessionId);
      if (!session) throw new Error("Session not found");

      const question = session.questions[questionIdx];
      if (!question) throw new Error("Question not found");

      let speechMetrics: any = null;
      let transcription = answerText;
      let speechMetricsStatus: "available" | "unavailable" | undefined;

      // Stage 1: Transcription & Speech Analysis (if audio exists)
      if (audioFilePath) {
        try {
          pushSocketUpdate(io, userId, sessionId, "AI_TRANSCRIBING", `Analyzing speech patterns...`);
          const audioBuffer = await fs.promises.readFile(audioFilePath);

          const analysisResult = await aiService.analyzeSpeech(audioBuffer, undefined, path.basename(audioFilePath));
          transcription = analysisResult.transcript || "";
          speechMetrics = analysisResult.metrics || null;
          speechMetricsStatus = analysisResult.metrics_status;
          if (typeof transcription !== "string" || !transcription.trim()) throw new Error("No speech detected");
        } finally {
          // Ensure temp file is deleted even if transcription fails
          if (fs.existsSync(audioFilePath)) {
            await fs.promises.unlink(audioFilePath).catch((err) =>
              console.error("Error unlinking file:", err)
            );
          }
        }
      }

      // Stage 2: AI Evaluation (Groq-powered via the Python microservice)
      pushSocketUpdate(io, userId, sessionId, "AI_EVALUATING", `Evaluating question ${questionIdx + 1}...`);

      let rubricView:EvaluationView|undefined;let rubricProvider:ProviderResult|null=null;
      if(session.scoringVersion === "rubric-v1") {
        prepared=await evaluationService.prepare(sessionId,userId,questionIdx,transcription,codeSubmission || "",diagramImageUrl);
        const computed=await evaluationService.compute(prepared);rubricView=computed.view;rubricProvider=computed.provider;
      }
      const evaluation = rubricView ? {technical_score:rubricView.technicalScore ?? undefined,confidence_score:undefined,ideal_answer:"",ai_feedback:rubricView.feedback} : await aiService.evaluateAnswer({
        question: question.questionText,
        question_type: question.questionType as "coding" | "oral" | "system-design",
        user_answer: transcription,
        user_code: codeSubmission || "",
        selected_language: language || "plaintext",
        diagram_payload: diagramImageUrl || undefined,
        role: session.role,
        level: session.level,
        interview_type: session.interviewType,
      });

      // Stage 3: Serialized Update (per-session lock prevents lost updates)
      const updatedSession = await withSessionLock(sessionId, async () => {
        const fresh = await sessionRepository.findById(sessionId);
        if (!fresh) throw new Error("Failed to update session during evaluation");

        const q = fresh.questions[questionIdx];
        if (!q) throw new Error("Question not found during evaluation update");
        if (fresh.status !== "in-progress" || q.isEvaluated || !q.isSubmitted) throw new SessionStateError("Answer no longer awaiting evaluation");
        q.speechMetricsStatus = speechMetricsStatus;
        delete q.processingError;
        // Reserve follow-up capacity under the same lock. Other evaluations cannot
        // complete this session while an accepted follow-up is being generated.
        const used = fresh.questions.filter(item => item.followUpOf !== undefined || item.followUpPending).length;
        q.followUpPending = (rubricView?!!rubricView.followUpConceptId:(evaluation.technical_score ?? 100) < 60) && q.followUpOf === undefined && used < 2;
        if(rubricView && prepared)q.evaluation=await evaluationService.commit(userId,prepared.attempt,rubricView,rubricProvider);

        q.userAnswerText = transcription;
        q.userSubmittedCode = codeSubmission || "";
        q.diagramImageUrl = diagramImageUrl || "";
        q.language = language || q.language;
        q.idealAnswer = evaluation.ideal_answer;
        q.technicalScore = evaluation.technical_score;
        q.confidenceScore = evaluation.confidence_score;
        q.aiFeedback = evaluation.ai_feedback;
        q.isEvaluated = true;
        q.isSubmitted = true;
        q.updatedAt = new Date().toISOString();

        if (speechMetrics) {
          const PACE_SLOW = 110;
          const PACE_FAST = 160;
          const CLARITY_FILLER_PENALTY = 2;
          const CLARITY_PAUSE_PENALTY = 1.5;

          q.speechMetrics = {
            fillerWordCount: speechMetrics.filler_words_count || 0,
            fillerWords: [],
            speakingPaceWpm: speechMetrics.pace_wpm || 0,
            paceRating: (speechMetrics.pace_wpm < PACE_SLOW) ? 'Slow' : (speechMetrics.pace_wpm > PACE_FAST) ? 'Fast' : 'Good',
            totalPauseDurationMs: (speechMetrics.pause_time_seconds || 0) * 1000,
            pauseCount: speechMetrics.pause_count || 0,
            clarityScore: Math.max(0, 100 - ((speechMetrics.filler_words_count || 0) * CLARITY_FILLER_PENALTY) - ((speechMetrics.pause_count || 0) * CLARITY_PAUSE_PENALTY)),
          };
        }

        return sessionRepository.save(fresh);
      });

      // Add XP for answering a question
      try {
        await gamificationService.addXP(userId, 'question_answered');
      } catch (err) {
        console.error(`[Gamification] Failed to add XP for question:`, err);
      }

      // Stage 4: Cross-questioning — weak answer? The interviewer probes deeper.
      if (updatedSession.questions[questionIdx].followUpPending) {
        try {
          pushSocketUpdate(io, userId, sessionId, "AI_FOLLOWUP", "Interviewer is preparing a follow-up...");

          const followUp = await aiService.generateFollowUp({
            question: question.questionText,
            userAnswer: transcription || codeSubmission || "No answer provided.",
            aiFeedback: rubricView?.followUpConceptId?`Probe the gap in concept ${rubricView.concepts.find(c=>c.id===rubricView.followUpConceptId)?.label || "understanding"}. ${evaluation.ai_feedback || ""}`:evaluation.ai_feedback || "",
            role: updatedSession.role,
            level: updatedSession.level,
          });

          const appended = await withSessionLock(sessionId, async () => {
            const fresh = await sessionRepository.findById(sessionId);
            // Don't resurrect a session the user already finished manually
            if (!fresh || fresh.status !== "in-progress") return null;

            const original = fresh.questions[questionIdx];
            if (!original?.followUpPending) return null;
            original.followUpPending = false;
            if (fresh.questions.filter(q => q.followUpOf !== undefined).length >= 2) return sessionRepository.save(fresh);
            fresh.questions.push({
              questionText: followUp.question,
              questionType: "oral",
              idealAnswer: rubricView?"":followUp.ideal_answer,
              questionVersionId: rubricView?question.questionVersionId:undefined,
              primaryCompetency: question.primaryCompetency,
              followUpConceptId: rubricView?.followUpConceptId,
              parentEvaluationId: original.evaluation?.id,
              isSubmitted: false,
              isEvaluated: false,
              followUpOf: questionIdx,
              createdAt: new Date().toISOString(),
            });
            return sessionRepository.save(fresh);
          });

          if (appended) {
            pushSocketUpdate(
              io,
              userId,
              sessionId,
              "FOLLOW_UP_ADDED",
              "The interviewer has a follow-up question for you",
              appended
            );
          }
        } catch (err: any) {
          // Follow-ups are best-effort — never block the evaluation flow
          console.error("[FollowUp] Generation failed (non-fatal)");
        } finally {
          await withSessionLock(sessionId, async () => {
            const fresh = await sessionRepository.findById(sessionId);
            if (fresh?.questions[questionIdx]?.followUpPending) {
              fresh.questions[questionIdx].followUpPending = false;
              await sessionRepository.save(fresh);
            }
          });
        }
      }

      // Re-read under the lock: snapshots taken before parallel evaluations are stale.
      const finalSession = await withSessionLock(sessionId, async () => {
        const fresh = await sessionRepository.findById(sessionId);
        if (!fresh) return null;
        if (fresh.status === "in-progress" && fresh.questions.length > 0 &&
          fresh.questions.every(q => q.isEvaluated && !q.followUpPending)) return completeLocked(fresh);
        return fresh;
      });
      if (finalSession) pushSocketUpdate(io, userId, sessionId,
        finalSession.status === "completed" ? "session completed" : "evaluation completed",
        `Feedback for Q${questionIdx + 1} ready`, finalSession);
    } catch (error: any) {
      // Provider/network bodies may contain private request details. Log only a safe category.
      console.error("Evaluation Async Task Error:", error instanceof SessionStateError ? "session_state" : "ai_or_persistence_unavailable");

      if(prepared)await evaluationService.fail(prepared.attempt,userId).catch(()=>undefined);
      // Revert isSubmitted flag on error so the user can try again
      const errSession = await withSessionLock(sessionId, async () => {
        const fresh = await sessionRepository.findById(sessionId);
        if (!fresh) return null;

        const q = fresh.questions[questionIdx];
        if (q && !q.isEvaluated) {
          q.isSubmitted = false;
          q.processingError = "Answer processing failed. Please retry or record again. No score was saved.";
          return sessionRepository.save(fresh);
        }
        return fresh;
      }).catch(() => null);

      pushSocketUpdate(
        io,
        userId,
        sessionId,
        "error",
        errSession?.questions[questionIdx]?.isEvaluated ? "Feedback saved, but finalization failed. Use Finish Session to retry." : "Answer processing failed. Please retry or record again.",
        errSession
      );
    }
  },

  async endInterviewSession(sessionId: string, userId: string | any, io: any) {
    const session = await withSessionLock(sessionId, async () => {
      const fresh = await sessionRepository.findByIdForUser(sessionId, userId.toString());
      if (!fresh) {
        throw new Error("Session not found");
      }

      return completeLocked(fresh);
    });

    pushSocketUpdate(
      io,
      userId.toString(),
      sessionId,
      "session completed",
      "Session ended",
      session
    );

    return session;
  },
};
