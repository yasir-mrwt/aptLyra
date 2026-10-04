/**
 * @file controllers/resumeController.ts
 * @description Resume upload and retrieval controllers with TypeScript support.
 *
 * ARCHITECTURE OVERVIEW:
 * This file acts as the primary API bridge between the Frontend and the Backend ML logic.
 * - `uploadResume`: Saves the file to disk, creates a Redis document, and instantly enqueues a background BullMQ job.
 * - `getResume`: Retrieves the parsed/analyzed resume, using a Redis result cache for speed.
 * - `rewriteBullet` & `generateCoverLetter`: Synchronously passes specific ML requests to the FastAPI Python service.
 */

import { Response } from "express";
import fs from "fs/promises";
import asyncHandler from "express-async-handler";
import { resumeRepository } from "../models/Resume.js";
import { addResumeJob, connection as redis } from "../services/queue/queueService.js";
import { emitResumeStatus } from "../services/socketService.js";
import { AppError } from "../types/errors.js";
import logger from "../utils/logger.js";
import fetch from "node-fetch";

import { AuthenticatedRequest } from "../types/express.js";

/**
 * @desc    Upload a resume
 * @route   POST /api/resume/upload
 * @access  Private
 */
export const uploadResume = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    throw new AppError("INVALID_FILE", "Please upload a file", {}, 400);
  }

  const { jdText } = req.body;
  const { originalname, filename, mimetype, size, path } = req.file;

  if (!req.user) {
    throw new AppError("UNAUTHORIZED", "User not authenticated", {}, 401);
  }

  // Map mimetype to enum
  let fileType: "pdf" | "docx" | "txt" = "pdf";
  if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    fileType = "docx";
  } else if (mimetype === "text/plain") {
    fileType = "txt";
  }

  // 1. Create Resume Document
  const resume = await resumeRepository.create({
    user: req.user._id,
    originalFilename: originalname,
    storedFilename: filename,
    fileType,
    fileSize: size,
    filePath: path,
    status: "pending",
    jdText: jdText || null,
  });

  logger.info("Resume document created", { resumeId: resume._id, userId: req.user._id, requestId: req.requestId });

  // 2. Enqueue Background Job
  const job = await addResumeJob(resume._id);

  logger.info("Resume job enqueued", { resumeId: resume._id, jobId: job.id, requestId: req.requestId });

  // 3. Save jobId to Document
  resume.jobId = job.id;
  await resumeRepository.save(resume);

  // 4. Emit Socket.IO Event
  const io = req.app.get("io");
  if (io) {
    emitResumeStatus(io, req.user._id.toString(), {
      resumeId: resume._id,
      status: "pending",
    });
  }

  // 5. Respond
  res.status(201).json({
    success: true,
    data: {
      resumeId: resume._id,
      jobId: job.id,
      status: "pending",
    },
  });
});

/**
 * @desc    Get all user resumes (paginated)
 * @route   GET /api/resume?page=1&limit=20
 * @access  Private
 */
export const getUserResumes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", "User not authenticated", {}, 401);
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const [resumes, total] = await Promise.all([
    resumeRepository.listForUser(req.user._id, skip, limit),
    resumeRepository.countForUser(req.user._id),
  ]);

  res.json({
    success: true,
    data: resumes,
    hasMore: skip + resumes.length < total,
    total,
  });
});

/**
 * @desc    Get single resume
 * @route   GET /api/resume/:id
 * @access  Private
 */
export const getResume = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", "User not authenticated", {}, 401);
  }

  const cacheKey = `resume-view:${req.params.id}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const resume = JSON.parse(cached);
    if (resume.user.toString() !== req.user._id.toString()) {
      throw new AppError("UNAUTHORIZED", "Not authorized to access this resume", {}, 401);
    }
    logger.info("Resume served from cache", { resumeId: req.params.id, userId: req.user._id });
    res.json({
      success: true,
      data: resume,
    });
    return;
  }

  const resume = await resumeRepository.findById(req.params.id as string);

  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", {}, 404);
  }

  // Check ownership
  if (resume.user.toString() !== req.user._id.toString()) {
    throw new AppError("UNAUTHORIZED", "Not authorized to access this resume", {}, 401);
  }

  // Cache if completed
  if (resume.status === "completed") {
    await redis.setex(cacheKey, 86400, JSON.stringify(resume)); // 24 hours
  }

  res.json({
    success: true,
    data: resume,
  });
});

/**
 * @desc    Get resume processing status
 * @route   GET /api/resume/:id/status
 * @access  Private
 */
export const getResumeStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", "User not authenticated", {}, 401);
  }

  const resume = await resumeRepository.findById(req.params.id as string);

  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", {}, 404);
  }

  if (resume.user.toString() !== req.user._id.toString()) {
    throw new AppError("UNAUTHORIZED", "Not authorized", {}, 401);
  }

  res.json({
    success: true,
    data: {
      status: resume.status,
      error: resume.error,
      scores: resume.scores,
    },
  });
});

/**
 * @desc    Delete a resume
 * @route   DELETE /api/resume/:id
 * @access  Private
 */
export const deleteResume = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", "User not authenticated", {}, 401);
  }

  const resume = await resumeRepository.findById(req.params.id as string);

  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", {}, 404);
  }

  if (resume.user.toString() !== req.user._id.toString()) {
    throw new AppError("UNAUTHORIZED", "Not authorized to delete this resume", {}, 401);
  }

  // Delete file from disk
  if (resume.filePath) {
    try {
      await fs.unlink(resume.filePath);
    } catch (err) {
      logger.warn("Failed to delete file from disk", { filePath: resume.filePath, error: err });
    }
  }

  // Invalidate the cached view
  const cacheKey = `resume-view:${req.params.id}`;
  try {
    await redis.del(cacheKey);
  } catch (err) {
    logger.warn("Failed to invalidate Redis cache", { cacheKey, error: err });
  }

  // Delete the document + index entries from Redis
  await resumeRepository.delete(resume);

  logger.info("Resume deleted", { resumeId: req.params.id, userId: req.user._id });

  res.json({
    success: true,
    message: "Resume deleted successfully",
  });
});

/**
 * @desc    Generate the Deep Insights report on demand — for resumes analyzed
 *          before the feature existed, or to refresh the intelligence.
 * @route   POST /api/resume/:id/insights
 * @access  Private
 */
export const generateInsights = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const resume = await resumeRepository.findById(req.params.id as string);

  if (!resume || resume.user.toString() !== req.user?._id.toString()) {
    throw new AppError("NOT_FOUND", "Resume not found", {}, 404);
  }

  const rawText = resume.parsedData?.rawText;
  if (!rawText) {
    throw new AppError("VALIDATION_ERROR", "Resume has no parsed text yet — wait for processing to finish", {}, 400);
  }

  const pythonServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
  const response = await fetch(`${pythonServiceUrl}/resume/v2/insights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.INTERNAL_API_KEY || ""
    },
    body: JSON.stringify({
      raw_text: rawText,
      parsed_profile: resume.parsedData?.parsedProfile || {},
      jd_text: resume.jdText || null,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError("INTERNAL_ERROR", "Failed to generate insights", { detail: errorText }, 502);
  }

  const data = (await response.json()) as { insights?: Record<string, any> };

  // Persist into the report so it's there on every future load
  resume.analysisReport = resume.analysisReport || {};
  resume.analysisReport._v2 = resume.analysisReport._v2 || {};
  resume.analysisReport._v2.insights = data.insights || {};
  await resumeRepository.save(resume);

  // Invalidate the cached API view so the next GET returns fresh data
  await redis.del(`resume-view:${resume._id}`).catch(() => undefined);

  res.json({ success: true, insights: data.insights });
});

/**
 * @desc    Rewrite a specific bullet point using AI
 * @route   POST /api/resume/:id/rewrite
 * @access  Private
 */
export const rewriteBullet = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { bullet } = req.body;

  if (!bullet) {
    throw new AppError("VALIDATION_ERROR", "Bullet point is required", {}, 400);
  }

  const resume = await resumeRepository.findById(id as string);
  if (!resume || resume.user.toString() !== req.user?._id.toString()) {
    throw new AppError("NOT_FOUND", "Resume not found", {}, 404);
  }

  const context = `Role: ${resume.analysisReport?._v2?.analysis?.role_summary || "Unknown Role"}`;

  const pythonServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
  const response = await fetch(`${pythonServiceUrl}/resume/v2/stream-bullet-rewrite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.INTERNAL_API_KEY || ""
    },
    body: JSON.stringify({ bullet, resume_context: context }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError("INTERNAL_ERROR", "Failed to rewrite bullet", { detail: errorText }, response.status);
  }

  if (!response.body) {
    throw new AppError("INTERNAL_ERROR", "No response body from AI service", {}, 500);
  }

  // Set proper headers for Server-Sent Events (or streaming text)
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");
  response.body.pipe(res);
});

/**
 * @desc    Generate a tailored cover letter using AI
 * @route   POST /api/resume/:id/cover-letter
 * @access  Private
 */
export const generateCoverLetter = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const resume = await resumeRepository.findById(id as string);
  if (!resume || resume.user.toString() !== req.user?._id.toString()) {
    throw new AppError("NOT_FOUND", "Resume not found", {}, 404);
  }

  const resumeText = resume.parsedData?.rawText;
  const jdText = resume.jdText;

  if (!resumeText || !jdText) {
    throw new AppError("VALIDATION_ERROR", "Resume text and Job Description text are required to generate a cover letter", {}, 400);
  }

  const pythonServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
  const response = await fetch(`${pythonServiceUrl}/resume/v2/stream-cover-letter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.INTERNAL_API_KEY || ""
    },
    body: JSON.stringify({ resume_text: resumeText, jd_text: jdText }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError("INTERNAL_ERROR", "Failed to generate cover letter", { detail: errorText }, response.status);
  }

  if (!response.body) {
    throw new AppError("INTERNAL_ERROR", "No response body from AI service", {}, 500);
  }

  // Set proper headers for Server-Sent Events (or streaming text)
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");
  response.body.pipe(res);
});
