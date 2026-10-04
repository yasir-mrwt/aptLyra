import express from "express";
import { getProfile, getLeaderboard, syncGamification } from "../controllers/gamificationController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.route("/profile").get(protect, getProfile);
router.route("/leaderboard").get(protect, getLeaderboard);
router.route("/sync").post(protect, syncGamification);

export default router;
