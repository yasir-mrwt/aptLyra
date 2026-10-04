/**
 * @file src/controllers/sessionController.ts
 * @description Thin session controllers for question generation, answer submissions, and evaluation.
 */
import { Response } from "express";
import asyncHandler from "express-async-handler";
import path from "path";
import { sessionService } from "../services/sessionService.js";
import { aiService } from "../services/aiService.js";

import { AuthenticatedRequest } from "../types/express.js";

/**
 * @desc Create a new interview session and trigger AI question generation
 * @route POST /api/sessions
 */
export const createSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { role, level, interviewType, count, resumeId } = req.body;
  const userId = req.user?.id || req.user?._id;
  const io = req.app.get("io");

  if (!userId || !role || !level || !interviewType || !count) {
    res.status(400);
    throw new Error("All fields are required");
  }

  const session = await sessionService.createInterviewSession(
    userId,
    role,
    level,
    interviewType,
    count,
    undefined,
    undefined,
    resumeId || undefined,
    io
  );

  res.status(201).json({
    message: "Session created successfully",
    sessionId: session._id,
    status: "processing",
  });
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
    res.status(404).json({ message: error.message });
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
    if (error.message === "Cannot delete a session while questions are being generated.") {
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
  const { questionIndex, code, language, diagramImageUrl } = req.body;
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  try {
    const audioFilePath = req.file ? path.join(process.cwd(), req.file.path) : null;

    await sessionService.submitSessionAnswer(
      sessionId,
      userId,
      questionIndex,
      code,
      language,
      audioFilePath,
      diagramImageUrl || null,
      req.app.get("io")
    );

    res.status(200).json({ message: "Answer received" });
  } catch (error: any) {
    res.status(404).json({ message: error.message });
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

  const session = await sessionService.getSessionDetails(sessionId, userId);
  const qIdx = parseInt(questionIndex, 10);
  const question = session.questions?.[qIdx];

  if (!question) {
    res.status(404).json({ message: "Question not found" });
    return;
  }

  try {
    const audio = await aiService.synthesizeSpeech(question.questionText);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(audio);
  } catch (error: any) {
    // 503 tells the client to fall back to browser speechSynthesis
    res.status(503).json({ message: "TTS unavailable", detail: error.message });
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
    if (error.message === "Evaluation in progress, please wait.") {
      res.status(400).json({ message: error.message });
    } else {
      res.status(404).json({ message: error.message });
    }
  }
});
