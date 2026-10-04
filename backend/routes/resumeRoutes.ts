/**
 * @file routes/resumeRoutes.ts
 * @description Resume API routes with TypeScript support
 */

import express, { Router } from "express";
import { protect } from "../middleware/auth.js";
import { uploadSingleResume } from "../middleware/resumeUploadMiddleware.js";
import {
  uploadResume,
  getUserResumes,
  getResume,
  getResumeStatus,
  rewriteBullet,
  generateCoverLetter,
  generateInsights,
  deleteResume,
} from "../controllers/resumeController.js";

import { requireInternalKey } from "../middleware/internalAuth.js";
import { processResumeWebhook } from "../controllers/webhookController.js";

const router: Router = express.Router();

router.route("/").get(protect, getUserResumes);

router.route("/upload").post(protect, uploadSingleResume, uploadResume);

router.route("/webhook/process-resume/:id").post(requireInternalKey, processResumeWebhook);

router.route("/:id").get(protect, getResume).delete(protect, deleteResume);

router.route("/:id/status").get(protect, getResumeStatus);

router.route("/:id/rewrite").post(protect, rewriteBullet);

router.route("/:id/insights").post(protect, generateInsights);

router.route("/:id/cover-letter").post(protect, generateCoverLetter);

export default router;
