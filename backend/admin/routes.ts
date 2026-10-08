import express from "express";
import asyncHandler from "express-async-handler";
import { protect } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../types/express.js";
import { roleManagement } from "./roleManagement.js";

const router = express.Router();
router.use(protect);
const actorId = (req: AuthenticatedRequest) => String(req.user?.id || req.user?._id || "");
const handle = (work: (req: AuthenticatedRequest) => Promise<unknown>) =>
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      res.json(await work(req));
    } catch (error) {
      const code = error instanceof Error ? error.message : "admin-operation-failed";
      const status = code === "role-forbidden" ? 403
        : code === "user-not-found" ? 404
          : code === "initial-owner-already-assigned" ? 409 : 400;
      res.status(status).json({ code: code.split(":")[0], message: "The requested role change could not be completed." });
    }
  });

router.get("/me", handle(req => roleManagement.current(actorId(req))));
router.get("/team", handle(req => roleManagement.team(actorId(req))));
router.patch("/team/:userId/role", handle(req => roleManagement.assignRole(actorId(req), String(req.params.userId), req.body?.role)));
router.post("/owner/transfer", handle(req => roleManagement.transferOwnership(actorId(req), req.body?.targetUserId)));

export default router;
