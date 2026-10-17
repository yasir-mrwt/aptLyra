/**
 * @file routes/sessionRoutes.ts
 * @description Session API routes with TypeScript support
 */

import asyncHandler from "express-async-handler";
import {SessionStateError} from "../services/sessionService.js";
import {activateInterview} from "../runtime/activation.js";
import type {AuthenticatedRequest} from "../types/express.js";
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
  transcribeAnswer,
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
router.post("/:sessionId/activate",asyncHandler(async(req:AuthenticatedRequest,res)=>{
  if(Object.keys(req.body||{}).length){res.status(400).json({message:"Activation accepts no client timestamps."});return;}
  try{res.json(await activateInterview(req.params.sessionId as string,String(req.user?.id||req.user?._id)));}
  catch(error){res.status(error instanceof SessionStateError?error.status:503).json({message:error instanceof SessionStateError?error.message:"Activation is temporarily unavailable. Your confirmed plan is saved; retry activation."});}
}));
router.post("/:sessionId/transcribe",rateLimit({windowMs:60000,limit:10}),uploadSingleAudio,transcribeAnswer);
router.route("/:sessionId/submit-answer").post(uploadSingleAudio, submitAnswer);
router.route("/:sessionId/speak").post(speakQuestion);
router.route("/:sessionId/end").post(endSession);
router.get("/:sessionId/operations",getOperations);
router.post("/:sessionId/operations/:operationId/retry",retryInterviewOperation);
router.post("/:sessionId/operations/:operationId/cancel",cancelInterviewOperation);

export default router;
