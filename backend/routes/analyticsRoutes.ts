import express from "express";
import { getOverallProgress } from "../controllers/analyticsController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/", protect, getOverallProgress);

export default router;
