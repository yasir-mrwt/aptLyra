/**
 * @file services/queue/resumeWorker.ts
 * @description BullMQ worker for resume processing pipeline
 */

import { Worker, Job } from "bullmq";
import { connection, ResumeJobData } from "./queueService.js";
import { resumeRepository, IResume } from "../../models/Resume.js";
import { emitResumeStatus } from "../socketService.js";
import { Server } from "socket.io";
import { stepProcess } from "./steps/stepProcess.js";
import { stepAnalyze } from "./steps/stepAnalyze.js";
import { stepMatch } from "./steps/stepMatch.js";
import { stepStreamFeedback } from "./steps/stepStreamFeedback.js";

// We'll pass the io instance from server.ts to this variable
let ioInstance: Server | null = null;

export const setWorkerIoInstance = (io: Server): void => {
  ioInstance = io;
};

// ============================================================================
// State-Machine Step Helpers
// ============================================================================

/**
 * Transition resume to a new status in Redis and emit Socket.IO update.
 */
const transitionState = async (
  resume: IResume,
  userId: string,
  status: string,
  extraPayload: Record<string, any> = {}
): Promise<void> => {
  resume.status = status as IResume["status"];
  await resumeRepository.save(resume);

  if (ioInstance) {
    emitResumeStatus(ioInstance, userId, {
      resumeId: resume._id,
      status,
      ...extraPayload,
    });
  }
  console.log(`[Worker] Resume ${resume._id} → ${status}`);
};

// ============================================================================
// Main Orchestrator (State Machine)
// ============================================================================

const processJob = async (job: Job<ResumeJobData>): Promise<any> => {
  if (job.name !== "parse-resume" && job.name !== "analyze-resume") {
    console.warn(`[Worker] Ignoring job with unknown name: ${job.name}`);
    return;
  }
  const { resumeId } = job.data;
  console.log(`[Worker] ═══════════════════════════════════════════════`);
  console.log(`[Worker] Started ${job.name} for resume: ${resumeId}`);
  console.log(`[Worker] ═══════════════════════════════════════════════`);

  try {
    const resume = await resumeRepository.findById(resumeId);
    if (!resume) throw new Error("Resume not found in database");

    const userId = resume.user.toString();

    if (job.name === "parse-resume") {
      // ── STATE 1: pending → processing ──
      await transitionState(resume, userId, "processing");

      // ── STEP 1: File Processing + Parsing (Async Webhook) ──
      await stepProcess(resume);

      console.log(`[Worker] Process dispatched to AI Service. Waiting for webhook...`);
      return { success: true, status: "async_dispatched" };
    }

    if (job.name === "analyze-resume") {
      const allMetrics: Record<string, any> = resume.metrics || {};

      // Kick off streaming feedback asynchronously so the UI gets live data while analyzing
      if (ioInstance) {
        stepStreamFeedback(resume, userId, ioInstance).catch(err => {
          console.error(`[Worker] Background streaming failed:`, err);
        });
      }

      // ── STATE 3: parsed → analyzing ──
      await transitionState(resume, userId, "analyzing");

      // ── STEP 2: Modular Analysis ──
      const analysisResult = await stepAnalyze(resume);

      // Build backward-compatible analysisReport structure
      resume.analysisReport = {
        extracted_data: {
          skills: analysisResult.skills || {},
          ...(resume.parsedData?.parsedProfile || {}),
        },
        evaluation: {
          ats_score: analysisResult.evaluation?.ats_score || 0,
          overall_quality: analysisResult.evaluation?.overall_quality || 0,
          strengths: analysisResult.analysis?.strengths || [],
          weaknesses: analysisResult.analysis?.weaknesses || [],
          improvement_suggestions: analysisResult.recommendations?.content_optimizations || [],
          candidate_summary: analysisResult.report?.recruiter_summary || "",
        },
        // Preserve raw modular outputs for v2 consumers
        _v2: {
          skills: analysisResult.skills,
          analysis: analysisResult.analysis,
          scores: analysisResult.evaluation,
          recommendations: analysisResult.recommendations,
          report: analysisResult.report,
          insights: analysisResult.insights || {},
        },
      };
      resume.scores = {
        ats: analysisResult.evaluation?.ats_score || 0,
        overall: analysisResult.evaluation?.overall_quality || 0,
        jdMatch: 0,
      };
      Object.assign(allMetrics, analysisResult.metrics || {});

      // ── STEP 3: JD Matching (optional) ──
      if (resume.jdText) {
        // ── STATE 4: analyzing → matching ──
        await transitionState(resume, userId, "matching");

        try {
          // Collect all resume skills for semantic vector comparison
          const resumeSkills = [
            ...(analysisResult.skills?.technical || []),
            ...(analysisResult.skills?.soft || []),
          ];

          const matchResult = await stepMatch(resume, resumeSkills);

          resume.jdMatchReport = matchResult;
          resume.scores.jdMatch = matchResult.match_score || 0;
          Object.assign(allMetrics, matchResult.metrics || {});

          console.log(`[Worker] JD Matching completed for resume: ${resumeId}`);
        } catch (matchErr) {
          const errorMessage = matchErr instanceof Error ? matchErr.message : String(matchErr);
          console.error(`[Worker] JD Matching failed (non-fatal): ${errorMessage}`);
          // JD matching failure is non-fatal — continue to completed state
        }
      }

      // ── STATE FINAL: → completed ──
      resume.metrics = allMetrics;
      await transitionState(resume, userId, "completed", {
        scores: resume.scores,
      });

      console.log(`[Worker] ═══════════════════════════════════════════════`);
      console.log(`[Worker] Pipeline completed for resume: ${resumeId}`);
      console.log(`[Worker] ═══════════════════════════════════════════════`);

      return { success: true, status: "completed" };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Worker] Pipeline FAILED for resume ${resumeId}:`, errorMessage);

    // Handle failure — update Redis and emit socket event
    try {
      const resume = await resumeRepository.findById(resumeId);
      if (resume) {
        resume.status = "failed";
        resume.error = errorMessage;
        await resumeRepository.save(resume);

        if (ioInstance) {
          emitResumeStatus(ioInstance, resume.user.toString(), {
            resumeId,
            status: "failed",
            error: errorMessage,
          });
        }
      }
    } catch (dbError) {
      console.error("[Worker] Failed to update resume status after pipeline error", dbError);
    }

    throw error;
  }
};

export const startResumeWorker = (): Worker => {
  const worker = new Worker("resume-processing", processJob, { connection: connection as any });

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed!`);
  });

  worker.on("failed", (job, err) => {
    console.log(`[Worker] Job ${job?.id} failed:`, err?.message);
  });

  return worker;
};
