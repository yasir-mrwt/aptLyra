import express from "express";
import { executeCode } from "../controllers/codeController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Route: POST /api/code/execute
router.post("/execute", protect, executeCode);

export default router;
