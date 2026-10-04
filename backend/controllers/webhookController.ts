import { Response, Request } from "express";
import asyncHandler from "express-async-handler";
import { resumeRepository } from "../models/Resume.js";
import { addResumeAnalyzeJob } from "../services/queue/queueService.js";
import logger from "../utils/logger.js";
import { emitResumeStatus } from "../services/socketService.js";

/**
 * @desc    Receive webhook from Python AI service when process step completes
 * @route   POST /api/resume/webhook/process-resume/:id
 * @access  Public (Should ideally be protected by a shared secret)
 */
export const processResumeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;

  const resume = await resumeRepository.findById(id as string);
  if (!resume) {
    res.status(404).json({ error: "Resume not found" });
    return;
  }

  if (!payload.success) {
    // Process failed
    resume.status = "failed";
    resume.error = payload.error || "Async processing failed";
    await resumeRepository.save(resume);

    const io = req.app.get("io");
    if (io && resume.user) {
      emitResumeStatus(io, resume.user.toString(), {
        resumeId: id,
        status: "failed",
        error: resume.error,
      });
    }
    res.status(200).json({ status: "handled_failure" });
    return;
  }

  // Handle Success
  const processResult = payload.data;

  if (processResult.success === false && processResult.is_resume === false) {
    resume.status = "invalid_document";
    await resumeRepository.save(resume);

    const io = req.app.get("io");
    if (io && resume.user) {
      emitResumeStatus(io, resume.user.toString(), {
        resumeId: id,
        status: "invalid_document",
        error: processResult.message || "Invalid document format"
      });
    }
    res.status(200).json({ status: "handled_invalid" });
    return;
  }

  resume.parsedData = {
    rawText: processResult.raw_text,
    method: processResult.method_used,
    parsedProfile: processResult.parsed_profile || {},
  };
  resume.metrics = { ...(resume.metrics || {}), ...(processResult.metrics || {}) };
  resume.status = "parsed";
  await resumeRepository.save(resume);

  const io = req.app.get("io");
  if (io && resume.user) {
    emitResumeStatus(io, resume.user.toString(), {
      resumeId: id,
      status: "parsed",
    });
  }

  logger.info("Resume process webhook received, enqueuing analyze job", { resumeId: id });

  // Enqueue next step
  await addResumeAnalyzeJob(id as string);

  res.status(200).json({ status: "success" });
});
