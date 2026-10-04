import { Response } from "express";
import asyncHandler from "express-async-handler";
import { sessionRepository, ISession } from "../models/Session.js";
import { AuthenticatedRequest } from "../types/express.js";
import { userRepository } from "../models/User.js";
import { getTitleForLevel, getXPForLevel } from "../config/achievements.js";
import { gamificationService } from "../services/gamificationService.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * @desc Get overall progress metrics (total interviews, avg score, recent trend)
 * @route GET /api/analytics/progress
 *
 * All former MongoDB aggregation pipelines are computed in-process from the
 * user's completed sessions stored in Upstash Redis.
 */
export const getOverallProgress = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const uid = userId.toString();
  const [user, completedSessions] = await Promise.all([
    userRepository.findById(uid),
    sessionRepository.listCompletedForUser(uid),
  ]);

  // 1. Overall stats
  const overallStats =
    completedSessions.length > 0
      ? {
          totalSessions: completedSessions.length,
          averageOverallScore: round2(average(completedSessions.map((s) => s.overallScore || 0))),
          averageTechnicalScore: round2(average(completedSessions.map((s) => s.metrics?.avgTechnical || 0))),
          averageConfidenceScore: round2(average(completedSessions.map((s) => s.metrics?.avgConfidence || 0))),
        }
      : null;

  // 2. Progress over time (Scores by date, oldest first)
  const progressOverTime = [...completedSessions]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((s) => ({
      _id: s._id,
      date: s.createdAt.slice(0, 10), // YYYY-MM-DD
      overallScore: s.overallScore,
      technicalScore: s.metrics?.avgTechnical || 0,
      confidenceScore: s.metrics?.avgConfidence || 0,
    }));

  // 3. Performance by Role
  const roleBuckets = new Map<string, { sessionsCount: number; totalScore: number }>();
  for (const s of completedSessions) {
    const bucket = roleBuckets.get(s.role) || { sessionsCount: 0, totalScore: 0 };
    bucket.sessionsCount += 1;
    bucket.totalScore += s.overallScore || 0;
    roleBuckets.set(s.role, bucket);
  }
  const performanceByRole = [...roleBuckets.entries()]
    .map(([role, { sessionsCount, totalScore }]) => ({
      _id: role,
      sessionsCount,
      avgScore: round2(totalScore / sessionsCount),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // 4. Speech metrics aggregates (if available)
  const questionsWithSpeech = completedSessions.flatMap((s: ISession) =>
    (s.questions || []).filter((q) => q.speechMetrics)
  );
  const speechMetrics =
    questionsWithSpeech.length > 0
      ? {
          avgPace: round2(average(questionsWithSpeech.map((q) => q.speechMetrics!.speakingPaceWpm || 0))),
          avgFillerWords: round2(average(questionsWithSpeech.map((q) => q.speechMetrics!.fillerWordCount || 0))),
          avgClarity: round2(average(questionsWithSpeech.map((q) => q.speechMetrics!.clarityScore || 0))),
        }
      : null;

  let gamificationData = null;
  if (user) {
    const currentLevelXp = getXPForLevel(user.currentLevel);
    const nextLevelXp = getXPForLevel(user.currentLevel + 1);

    // Fetch detailed gamification record for achievements
    const gamificationRecord = await gamificationService.getProfile(user._id);

    gamificationData = {
      xp: user.xp,
      currentLevel: user.currentLevel,
      currentTitle: getTitleForLevel(user.currentLevel),
      streakDays: user.streakDays,
      lastActiveDate: user.lastActiveDate,
      currentLevelXp: currentLevelXp,
      nextLevelXp: nextLevelXp,
      achievements: gamificationRecord?.achievements || [],
      badges: gamificationRecord?.badges || []
    };
  }

  res.json({
    stats: overallStats || {
      totalSessions: 0,
      averageOverallScore: 0,
      averageTechnicalScore: 0,
      averageConfidenceScore: 0
    },
    progress: progressOverTime,
    byRole: performanceByRole,
    speech: speechMetrics,
    gamification: gamificationData
  });
});
