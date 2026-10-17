import express from "express";
import { setLeaderboardPreference, getProfile, getPracticeCalendar, getLeaderboard, syncGamification } from "../controllers/gamificationController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/activity",protect,getPracticeCalendar);
router.route("/profile").get(protect, getProfile);
router.route("/leaderboard").get(protect, getLeaderboard).put(protect, setLeaderboardPreference);
router.route("/sync").post(protect, syncGamification);

export default router;
