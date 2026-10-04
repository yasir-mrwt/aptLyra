import { Request, Response } from "express";
import { gamificationService } from "../services/gamificationService.js";
import { AuthenticatedRequest } from "../types/express.js";
import { getTitleForLevel } from "../config/achievements.js";

export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const profile = await gamificationService.getProfile(userId);
    const title = getTitleForLevel(profile.level);
    res.json({ ...profile, title });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    let limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    limit = Math.max(1, Math.min(limit, 100)); // Validate positive, max 100
    const leaderboard = await gamificationService.getLeaderboard(limit);

    const formatted = leaderboard.map((entry: any, index) => ({
      userId: entry.user?._id?.toString() || entry._id?.toString(),
      rank: index + 1,
      name: entry.user?.name || "Anonymous User",
      level: entry.level,
      xp: entry.xp,
    }));

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const syncGamification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!._id.toString();
    const streakResult = await gamificationService.updateStreak(userId);
    const flushResult = await gamificationService.flushXP(userId);
    res.json({ streak: streakResult, flush: flushResult });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
