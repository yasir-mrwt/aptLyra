/**
 * @file src/controllers/sessionController.ts
 * @description Thin session controllers for question generation, answer submissions, and evaluation.
 */
import { Response } from "express";
import asyncHandler from "express-async-handler";
import path from "path";
import fs from "node:fs/promises";
import { SessionStateError } from "../services/sessionService.js";
import { sessionService } from "../services/sessionService.js";
import { aiService } from "../services/aiService.js";

import { AuthenticatedRequest } from "../types/express.js";

/** Historical clients must migrate to the owned planner preview/confirm contract. */
export const createSession = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.status(410).json({code:"planner_required",message:"Create an interview using plan preview and confirmation."});
});

/**
 * @desc Get all interview sessions for the logged-in user
 * @route GET /api/sessions
 */
export const getSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  const result = await sessionService.getSessionsForUser(userId, page, limit);

  res.status(200).json({
    message: "Sessions retrieved successfully",
    ...result,
  });
});

/**
 * @desc Get a specific interview session by ID
 * @route GET /api/sessions/:sessionId
 */
export const getSessionById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  try {
    const session = await sessionService.getSessionDetails(sessionId, userId);
    res.status(200).json({ message: "Session found", session });
  } catch (error: any) {
    const missing=error.message==="Session not found";
    res.status(missing?404:503).json({ message: missing?"Session not found":"Saved interview progress is temporarily unavailable. Please retry." });
  }
});

/**
 * @desc Delete an interview session
 * @route DELETE /api/sessions/:sessionId
 */
export const deleteSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  try {
    const id = await sessionService.deleteInterviewSession(sessionId, userId);
    res.status(200).json({ id, message: "Session deleted successfully" });
  } catch (error: any) {
    if (error instanceof SessionStateError) {
      res.status(error.status).json({ message: error.message });
    } else if (error.message === "Cannot delete a session while questions are being generated.") {
      res.status(400).json({ message: error.message });
    } else {
      res.status(404).json({ message: error.message });
    }
  }
});

/**
 * @desc Submit a question answer (code and/or audio)
 * @route POST /api/sessions/:sessionId/submit-answer
 */
export const submitAnswer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const { questionIndex, code, language, diagramImageUrl, answerText } = req.body;
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  try {
    const audioFilePath = req.file ? path.join(process.cwd(), req.file.path) : null;

    const operation=await sessionService.submitSessionAnswer(
      sessionId,
      userId,
      questionIndex,
      code ?? null,
      language ?? null,
      audioFilePath,
      diagramImageUrl || null,
      req.app.get("io"),
      answerText
    );

    if(operation && req.file)await fs.unlink(req.file.path).catch(()=>undefined);
    res.status(200).json({ message: "Answer received",...(operation?{operation}: {}) });
  } catch (error: any) {
    if (req.file) await fs.unlink(req.file.path).catch(() => undefined);
    const status = error instanceof SessionStateError ? error.status : ["Session not found", "Question not found"].includes(error.message) ? 404 : 500;
    res.status(status).json({ message: status === 500 ? "Unable to submit answer. Please retry." : error.message });
  }
});

/**
 * @desc Speak a question aloud — AI interviewer voice (Groq TTS).
 *       Reads the question text server-side (by index) so clients can't
 *       synthesize arbitrary text through our Groq quota.
 * @route POST /api/sessions/:sessionId/speak
 */
export const speakQuestion = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const { questionIndex } = req.body;
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  if (!/^\d+$/.test(String(questionIndex))) {
    res.status(400).json({ message: "Invalid question index" });
    return;
  }
  let session;
  try { session = await sessionService.getSessionDetails(sessionId, userId); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "Session not found") throw error;
    res.status(404).json({ message: "Session not found" }); return;
  }
  if (session.status !== "in-progress") {
    res.status(409).json({ message: "This interview is not active" });
    return;
  }
  const qIdx = Number(questionIndex);
  const question = session.questions?.[qIdx];

  if (!question) {
    res.status(404).json({ message: "Question not found" });
    return;
  }

  if(question.evidenceUnavailable){res.status(409).json({message:"This planned question is unavailable. Create a fresh plan."});return;}

  try {
    const audio = await aiService.synthesizeSpeech(question.questionText);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(audio);
  } catch {
    // 503 tells the client to fall back to browser speechSynthesis
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ code: "tts_unavailable", message: "Server voice unavailable. Use browser voice or read the question.", retryable: false });
  }
});

/**
 * @desc Manually end an interview session
 * @route POST /api/sessions/:sessionId/end
 */
export const endSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  try {
    const session = await sessionService.endInterviewSession(
      sessionId,
      userId,
      req.app.get("io")
    );
    res.status(200).json({ message: "Session ended", session });
  } catch (error: any) {
    if (error instanceof SessionStateError) {
      res.status(error.status).json({ message: error.message });
    } else if (error.message === "Evaluation in progress, please wait.") {
      res.status(400).json({ message: error.message });
    } else {
      res.status(error.message === "Session not found" ? 404 : 500).json({ message: error.message === "Session not found" ? error.message : "Unable to finish interview. Please retry." });
    }
  }
});
