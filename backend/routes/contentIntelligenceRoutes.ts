import express from "express";
import asyncHandler from "express-async-handler";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth.js";
import { contentSubmissions } from "../contentIntelligence/submissions.js";
import { contentEditorial } from "../contentIntelligence/editorial.js";
import type { AuthenticatedRequest } from "../types/express.js";
import { sourceRegistry } from "../contentIntelligence/sourceRegistry.js";
import { contentTrends } from "../contentIntelligence/trends.js";

const router = express.Router();
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    code: "submission_rate_limit",
    message: "You have reached the hourly submission limit.",
  },
});
router.use(protect);
const userId = (req: AuthenticatedRequest) =>
  String(req.user?.id || req.user?._id || "");
const handle = (
  work: (req: AuthenticatedRequest) => Promise<unknown>,
  status = 200,
) =>
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      res.status(status).json(await work(req));
    } catch (error) {
      const code =
        error instanceof Error
          ? error.message
          : "content_intelligence_unavailable";
      const denied =
        code === "reviewer-not-authorized" || code === "submission-not-found";
      res
        .status(denied ? 403 : 400)
        .json({
          code: code.split(":")[0],
          message: denied
            ? "This action is unavailable for your account."
            : "Check the submission and consent fields, then try again.",
        });
    }
  });
router.get("/sources",handle(req=>sourceRegistry.list(userId(req))));
router.get("/sources/:id",handle(req=>sourceRegistry.get(userId(req),String(req.params.id))));
router.post("/sources",handle(req=>sourceRegistry.create(userId(req),req.body),201));
router.patch("/sources/:id",handle(req=>sourceRegistry.update(userId(req),String(req.params.id),req.body)));
router.post("/sources/:id/permission-review",handle(req=>sourceRegistry.reviewPermission(userId(req),String(req.params.id),String(req.body?.expectedHash||""))));
router.post("/sources/:id/enable",handle(req=>sourceRegistry.setEnabled(userId(req),String(req.params.id),true)));
router.post("/sources/:id/disable",handle(req=>sourceRegistry.setEnabled(userId(req),String(req.params.id),false)));
router.post("/sources/:id/withdraw",handle(req=>sourceRegistry.withdraw(userId(req),String(req.params.id),String(req.body?.reason||""))));
router.post("/sources/:id/collect",handle(req=>sourceRegistry.collect(userId(req),String(req.params.id),"manual"),202));
router.post("/sources/:id/retry",handle(req=>sourceRegistry.collect(userId(req),String(req.params.id),"retry"),202));
router.get("/sources/:id/collections",handle(req=>sourceRegistry.history(userId(req),String(req.params.id))));
router.get("/trends",handle(req=>contentTrends.list(userId(req),Number(req.query.days||90),typeof req.query.role==="string"?req.query.role:undefined,typeof req.query.company==="string"?req.query.company:undefined)));
router.post(
  "/submissions",
  submitLimiter,
  handle((req) => contentSubmissions.create(userId(req), req.body), 201),
);
router.get(
  "/submissions",
  handle((req) => contentSubmissions.listMine(userId(req))),
);
router.delete(
  "/submissions/:id",
  handle((req) =>
    contentSubmissions.withdrawMine(userId(req), String(req.params.id)),
  ),
);
router.get(
  "/review-queue",
  handle((req) => contentSubmissions.reviewQueue(userId(req))),
);
router.get(
  "/reviewer",
  handle(async (req) => ({
    reviewer: await contentSubmissions.reviewerFor(userId(req)),
  })),
);
router.get(
  "/review/candidates",
  handle((req) => contentEditorial.candidateQueue(userId(req))),
);
router.post("/review/candidates/:id/ai-review",handle(req=>contentEditorial.reviewCandidate(
  userId(req),String(req.params.id),String(req.body?.expectedHash||""),
)));
router.post("/review/records/:id/approve",handle(req=>contentEditorial.approveSourceRecord(userId(req),String(req.params.id),String(req.body?.expectedHash||""),req.body?.duplicateDecision)));
router.post("/review/records/:id/publish",handle(req=>contentEditorial.publishSourceRecord(userId(req),String(req.params.id))));
router.post(
  "/review/submissions/:id/extract",
  handle((req) =>
    contentEditorial.extractSubmission(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
    ),
  ),
);
router.post(
  "/review/candidates/:id/approve",
  handle((req) =>
    contentEditorial.approveQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      req.body?.duplicateDecision,
    ),
  ),
);
router.post(
  "/review/candidates/:id/edit-approve",
  handle((req) =>
    contentEditorial.editApproveQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      req.body?.specification,
      req.body?.derivation,
    ),
  ),
);
router.post(
  "/review/candidates/:id/reject",
  handle((req) =>
    contentEditorial.rejectQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      String(req.body?.reason || "reviewer-rejected"),
    ),
  ),
);
router.post(
  "/review/candidates/:id/duplicate",
  handle((req) =>
    contentEditorial.duplicateQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      String(req.body?.duplicateOf || ""),
      String(req.body?.reason || "duplicate-family"),
    ),
  ),
);
router.post(
  "/review/candidates/:id/family",
  handle((req) => contentEditorial.linkQuestionFamily(
    userId(req), String(req.params.id), String(req.body?.expectedHash || ""), String(req.body?.relatedId || ""),
  )),
);
router.post(
  "/review/candidates/:id/supersede",
  handle((req) => contentEditorial.supersedeQuestion(
    userId(req), String(req.params.id), String(req.body?.expectedHash || ""), String(req.body?.supersedesId || ""),
  )),
);
router.post(
  "/review/candidates/:id/withdraw",
  handle((req) =>
    contentEditorial.withdrawQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      String(req.body?.reason || "reviewer-withdrawn"),
    ),
  ),
);
router.get(
  "/scoring-queue",
  handle((req) => contentEditorial.scoringQueue(userId(req))),
);
router.get(
  "/published",
  handle((req) => contentEditorial.scoringQueue(userId(req))),
);
router.get(
  "/seed-review",
  handle((req) => contentEditorial.seedReview(userId(req))),
);
router.get(
  "/technical-references",
  handle((req) => contentEditorial.technicalReferenceOptions(userId(req))),
);
router.post(
  "/scoring/:questionVersionId/references",
  handle((req) =>
    contentEditorial.addTechnicalReference(
      userId(req),
      String(req.params.questionVersionId),
      String(req.body?.chunkId || ""),
    ),
  ),
);
router.delete(
  "/scoring/:questionVersionId/references/:chunkId",
  handle((req) =>
    contentEditorial.removeTechnicalReference(
      userId(req),
      String(req.params.questionVersionId),
      String(req.params.chunkId),
      String(req.body?.reason || "reference-withdrawn"),
    ),
  ),
);
router.post(
  "/scoring/:questionVersionId/draft",
  handle((req) =>
    contentEditorial.draftScoringPacket(
      userId(req),
      String(req.params.questionVersionId),
    ),
  ),
);
router.post(
  "/scoring/drafts/:draftId/edit",
  handle((req) => contentEditorial.editScoringPacket(userId(req),String(req.params.draftId),String(req.body?.expectedHash || ""),req.body?.content)),
);
router.post(
  "/scoring/drafts/:draftId/approve",
  handle((req) =>
    contentEditorial.approveScoringPacket(
      userId(req),
      String(req.params.draftId),
      String(req.body?.expectedHash || ""),
    ),
  ),
);
router.post(
  "/scoring/drafts/:draftId/reject",
  handle((req) =>
    contentEditorial.rejectScoringPacket(
      userId(req),
      String(req.params.draftId),
      String(req.body?.expectedHash || ""),
      String(req.body?.reason || "scoring-rejected"),
    ),
  ),
);
router.post(
  "/scoring/:questionVersionId/withdraw",
  handle((req) => contentEditorial.withdrawScoringPacket(userId(req),String(req.params.questionVersionId),String(req.body?.expectedHash || ""))),
);
router.post(
  "/review/candidates/:id/publish",
  handle((req) =>
    contentEditorial.publishQuestion(userId(req), String(req.params.id),String(req.body?.expectedHash || "")),
  ),
);
export default router;
