/**
 * @file routes/sessionRoutes.ts
 * @description Session API routes with TypeScript support
 */

import express, { Router } from "express";
import { protect } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";
import {
  createSession,
  getSession,
  getSessionById,
  deleteSession,
  submitAnswer,
  endSession,
  speakQuestion,
} from "../controllers/sessionController.js";
import { uploadSingleAudio } from "../middleware/uploadMiddleware.js";
import {getOperations,retryInterviewOperation,cancelInterviewOperation} from "../controllers/operationController.js";
const router: Router = express.Router();

const createSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  message: { message: "Too many sessions created from this IP, please try again after 15 minutes" },
});

router.use(protect);

router
  .route("/")
  .post(createSessionLimiter, createSession)
  .get(getSession);

router.route("/:sessionId").get(getSessionById).delete(deleteSession);
router.route("/:sessionId/submit-answer").post(uploadSingleAudio, submitAnswer);
router.route("/:sessionId/speak").post(speakQuestion);
router.route("/:sessionId/end").post(endSession);
router.get("/:sessionId/operations",getOperations);
router.post("/:sessionId/operations/:operationId/retry",retryInterviewOperation);
router.post("/:sessionId/operations/:operationId/cancel",cancelInterviewOperation);

export default router;
