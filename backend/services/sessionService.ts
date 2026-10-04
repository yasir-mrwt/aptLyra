import fs from "fs";
import { sessionRepository, withSessionLock, ISession } from "../models/Session.js";
import { resumeRepository } from "../models/Resume.js";
import { aiService } from "./aiService.js";
import { pushSocketUpdate } from "./socketService.js";
import { gamificationService } from "./gamificationService.js";

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
        });
        const questions = (aiData.questions || []).map((qInfo: any) => ({
          questionText: qInfo.question,
          idealAnswer: qInfo.ideal_answer,
          questionType: ["coding", "system-design"].includes(qInfo.question_type) ? qInfo.question_type : "oral",
          isEvaluated: false,
          isSubmitted: false,
        }));

        await withSessionLock(session._id, async () => {
          const fresh = (await sessionRepository.findById(session._id)) || session;
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
          const fresh = (await sessionRepository.findById(session._id)) || session;
          fresh.status = "failed";
          await sessionRepository.save(fresh);
        });
        pushSocketUpdate(
          io,
          userId.toString(),
          session._id,
          "GENERATION_FAILED",
          "Failed to generate questions",
          { error: error.message }
        );
      }
    })();

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
    return session;
  },

  async deleteInterviewSession(sessionId: string, userId: string | any) {
    const session = await sessionRepository.findByIdForUser(sessionId, userId.toString());
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status === "pending") {
      throw new Error("Cannot delete a session while questions are being generated.");
    }

    await sessionRepository.delete(session);
    return session._id;
  },

  async submitSessionAnswer(
    sessionId: string,
    userId: string | any,
    questionIndex: string,
    code: string | null,
    language: string | null,
    audioFilePath: string | null,
    diagramImageUrl: string | null,
    io: any
  ) {
    const qIdx = parseInt(questionIndex, 10);

    await withSessionLock(sessionId, async () => {
      const session = await sessionRepository.findByIdForUser(sessionId, userId.toString());
      if (!session) {
        throw new Error("Session not found");
      }

      if (!session.questions[qIdx]) {
        throw new Error("Question not found");
      }

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
      diagramImageUrl
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
    diagramImageUrl: string | null
  ) {
    try {
      const session = await sessionRepository.findById(sessionId);
      if (!session) throw new Error("Session not found");

      const question = session.questions[questionIdx];
      if (!question) throw new Error("Question not found");

      let speechMetrics: any = null;
      let transcription = "";

      // Stage 1: Transcription & Speech Analysis (if audio exists)
      if (audioFilePath) {
        try {
          pushSocketUpdate(io, userId, sessionId, "AI_TRANSCRIBING", `Analyzing speech patterns...`);
          const audioBuffer = await fs.promises.readFile(audioFilePath);

          const analysisResult = await aiService.analyzeSpeech(audioBuffer);
          transcription = analysisResult.transcript || "";
          speechMetrics = analysisResult.metrics || null;
        } catch (error: any) {
          console.error("Speech Analysis/Transcription Error:", error.message);
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

      const evaluation = await aiService.evaluateAnswer({
        question: question.questionText,
        question_type: question.questionType as "coding" | "oral" | "system-design",
        user_answer: transcription || "No verbal answer provided.",
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
      let sessionAfterFollowUp = updatedSession;
      const FOLLOWUP_SCORE_THRESHOLD = 60;
      const MAX_FOLLOWUPS_PER_SESSION = 2;
      const isWeakAnswer = (evaluation.technical_score ?? 0) < FOLLOWUP_SCORE_THRESHOLD;
      const isAlreadyFollowUp = question.followUpOf !== undefined && question.followUpOf !== null;
      const followUpCount = updatedSession.questions.filter(
        (q) => q.followUpOf !== undefined && q.followUpOf !== null
      ).length;

      if (isWeakAnswer && !isAlreadyFollowUp && followUpCount < MAX_FOLLOWUPS_PER_SESSION) {
        try {
          pushSocketUpdate(io, userId, sessionId, "AI_FOLLOWUP", "Interviewer is preparing a follow-up...");

          const followUp = await aiService.generateFollowUp({
            question: question.questionText,
            userAnswer: transcription || codeSubmission || "No answer provided.",
            aiFeedback: evaluation.ai_feedback || "",
            role: updatedSession.role,
            level: updatedSession.level,
          });

          const appended = await withSessionLock(sessionId, async () => {
            const fresh = await sessionRepository.findById(sessionId);
            // Don't resurrect a session the user already finished manually
            if (!fresh || fresh.status !== "in-progress") return null;

            fresh.questions.push({
              questionText: followUp.question,
              questionType: "oral",
              idealAnswer: followUp.ideal_answer,
              isSubmitted: false,
              isEvaluated: false,
              followUpOf: questionIdx,
              createdAt: new Date().toISOString(),
            });
            return sessionRepository.save(fresh);
          });

          if (appended) {
            sessionAfterFollowUp = appended;
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
          console.error("[FollowUp] Generation failed (non-fatal):", err.message);
        }
      }

      // Check if this was the last question (post follow-up append)
      const allEvaluated = sessionAfterFollowUp.questions.every((q) => q.isEvaluated);
      if (allEvaluated || updatedSession.status === "completed") {
        const finalSession = await withSessionLock(sessionId, async () => {
          const fresh = await sessionRepository.findById(sessionId);
          if (!fresh) return null;

          const scores = sessionRepository.calculateScoreSummary(fresh);
          fresh.overallScore = scores.overallScore;
          fresh.metrics.avgTechnical = scores.avgTechnical;
          fresh.metrics.avgConfidence = scores.avgConfidence;

          if (allEvaluated) {
            fresh.status = "completed";
            fresh.endTime = fresh.endTime || new Date().toISOString();
          }

          return sessionRepository.save(fresh);
        });

        // Add session completion XP and flush all buffered XP to Redis
        let levelUpInfo = null;
        try {
          await gamificationService.addXP(userId, 'session_completed');
          await gamificationService.updateStreak(userId);
          levelUpInfo = await gamificationService.flushXP(userId);
        } catch (err) {
          console.error(`[Gamification] Failed to flush XP on session completion:`, err);
        }

        // Include gamification updates in the socket payload
        if (finalSession) {
          const payload = { ...finalSession, gamification: levelUpInfo };

          pushSocketUpdate(
            io,
            userId,
            sessionId,
            "session completed",
            "Evaluation complete",
            payload
          );
        }
      } else {
        pushSocketUpdate(
          io,
          userId,
          sessionId,
          "evaluation completed",
          `Feedback for Q${questionIdx + 1} ready`,
          sessionAfterFollowUp
        );
      }
    } catch (error: any) {
      console.error("Evaluation Async Task Error:", error.message);

      // Revert isSubmitted flag on error so the user can try again
      const errSession = await withSessionLock(sessionId, async () => {
        const fresh = await sessionRepository.findById(sessionId);
        if (!fresh) return null;

        const q = fresh.questions[questionIdx];
        if (q && !q.isEvaluated) {
          q.isSubmitted = false;
          return sessionRepository.save(fresh);
        }
        return fresh;
      }).catch(() => null);

      pushSocketUpdate(
        io,
        userId,
        sessionId,
        "error",
        `Evaluation failed: ${error.message}`,
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

      // Prevent ending if answers are still being transcribed/evaluated
      if (fresh.questions.some((q) => !q.isEvaluated && q.isSubmitted)) {
        throw new Error("Evaluation in progress, please wait.");
      }

      const scores = sessionRepository.calculateScoreSummary(fresh);
      fresh.overallScore = scores.overallScore;
      fresh.metrics = {
        avgTechnical: scores.avgTechnical,
        avgConfidence: scores.avgConfidence,
      };
      fresh.status = "completed";
      fresh.endTime = new Date().toISOString();
      return sessionRepository.save(fresh);
    });

    let levelUpInfo = null;
    try {
      await gamificationService.addXP(userId.toString(), 'session_completed');
      await gamificationService.updateStreak(userId.toString());
      levelUpInfo = await gamificationService.flushXP(userId.toString());
    } catch (err) {
      console.error(`[Gamification] Failed to flush XP on manual session completion:`, err);
    }

    pushSocketUpdate(
      io,
      userId.toString(),
      sessionId,
      "session completed",
      "Session ended",
      { ...session, gamification: levelUpInfo }
    );

    return session;
  },
};
