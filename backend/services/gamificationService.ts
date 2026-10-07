import { userRepository } from "../models/User.js";
import { sessionRepository, ISession } from "../models/Session.js";
import { gamificationRepository, IGamification } from "../models/Gamification.js";
import { query,withDatabaseLock } from "../config/db.js";
import redisClient from "../config/redisConfig.js";
import { ACHIEVEMENTS, XP_REWARDS, getLevelForXP } from "../config/achievements.js";
import {randomUUID} from "node:crypto";

export const gamificationService = {
  async ensureGamificationRecord(userId: string): Promise<IGamification> {
    let record = await gamificationRepository.find(userId);
    if (!record) {
      // Migrate existing user data if necessary
      const user = await userRepository.findById(userId);
      record = await gamificationRepository.create({
        user: userId,
        xp: user?.xp || 0,
        level: user?.currentLevel || 1,
        currentStreak: user?.streakDays || 0,
        longestStreak: user?.streakDays || 0,
        lastActivityDate: user?.lastActiveDate || new Date().toISOString(),
      });
    }
    return record;
  },

  async addXP(userId: string, reason: 'question_answered' | 'session_completed') {
    const xpAmount = reason === 'session_completed' ? XP_REWARDS.COMPLETE_INTERVIEW : XP_REWARDS.PERFECT_QUESTION;
    const redisKey = `user:${userId}:xp_buffer`;
    try {
      await redisClient.incrby(redisKey, xpAmount);
    } catch (error) {
      console.error("Redis addXP failed:", error);
      throw error;
    }
  },

  /** Flush the buffered XP counter into the persistent gamification record. */
  async flushXP(userId: string) {
    return withDatabaseLock(`gamification:${userId}`, () => this.flushXPLocked(userId));
  },

  /** Completion XP is persisted in the same SQL transaction as completed status.
   * Redis continues to buffer question XP; it never receives completion XP. */
  async rewardCompletion(userId: string) {
    return withDatabaseLock(`gamification:${userId}`, async () => {
      await this.updateStreakLocked(userId);
      return this.flushXPLocked(userId, XP_REWARDS.COMPLETE_INTERVIEW);
    });
  },

  /** SQL ledger, XP and denormalized user fields share the caller's grade/report transaction. */
  async rewardDurable(sessionId:string,userId:string,key:string,completion=false) {
    return withDatabaseLock(`gamification:${userId}`,async()=>{
      const amount=completion?XP_REWARDS.COMPLETE_INTERVIEW:XP_REWARDS.PERFECT_QUESTION;
      const inserted=await query("INSERT INTO reward_ledger(id,session_id,user_id,reward_key,amount) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,reward_key) DO NOTHING RETURNING id",[randomUUID(),sessionId,userId,key,amount]);
      if(!inserted.rows.length)return null;
      if(completion)await this.updateStreakLocked(userId);
      return this.persistXPLocked(userId,amount);
    });
  },

  async flushXPLocked(userId: string, completionXP = 0) {
    const redisKey = `user:${userId}:xp_buffer`;

    // Atomically get and delete to prevent race conditions
    const multiResult = await redisClient.multi().get(redisKey).del(redisKey).exec();
    const bufferedXPStr = multiResult ? (multiResult[0][1] as string) : null;

    let bufferedXP = completionXP;
    if (bufferedXPStr && parseInt(bufferedXPStr, 10) > 0) {
      bufferedXP += parseInt(bufferedXPStr, 10);
    }

    return this.persistXPLocked(userId,bufferedXP);
  },

  async persistXPLocked(userId:string,bufferedXP:number) {
    const record = await this.ensureGamificationRecord(userId);

    record.xp += bufferedXP;

    // Run deep achievement check (XP rewards added before leveling)
    const newlyEarnedBadges = await this.checkAndAwardBadges(userId, record);

    if (bufferedXP > 0) {
      const firstInterview = record.achievements.find(a => a.achievementId === ACHIEVEMENTS.FIRST_INTERVIEW.id);
      if (!firstInterview) {
        record.achievements.push({
          achievementId: ACHIEVEMENTS.FIRST_INTERVIEW.id,
          progress: 1,
          isCompleted: true,
          completedAt: new Date().toISOString()
        });
        record.badges.push({ badgeId: ACHIEVEMENTS.FIRST_INTERVIEW.id, earnedAt: new Date().toISOString() });
        newlyEarnedBadges.push(ACHIEVEMENTS.FIRST_INTERVIEW.id);
        record.xp += XP_REWARDS.BADGE_EARNED;
      }
    }

    // Calculate level
    const newLevel = getLevelForXP(record.xp);

    let leveledUp = false;
    if (newLevel > record.level) {
      record.level = newLevel;
      leveledUp = true;
    }

    await gamificationRepository.save(record);

    // Sync to User record for backward compatibility (denormalized cache)
    await userRepository.updateFields(userId, {
      xp: record.xp,
      currentLevel: record.level,
      streakDays: record.currentStreak,
      lastActiveDate: record.lastActivityDate,
    });

    return {
      xpAdded: bufferedXP,
      totalXP: record.xp,
      newLevel: record.level,
      leveledUp,
      newlyEarnedBadges
    };
  },

  async checkAndAwardBadges(userId: string, record: IGamification): Promise<string[]> {
    const newlyEarned: string[] = [];

    // Load all completed sessions once and derive every badge signal in JS.
    // (Replaces the old MongoDB aggregation pipelines.)
    const completedSessions: ISession[] = await sessionRepository.listCompletedForUser(userId);

    const count = completedSessions.length;
    let hasPerfectScore = false;
    let hasSystemDesign = false;
    let weekendCount = 0;
    let nightCount = 0;
    const languages = new Set<string>();
    const types = new Set<string>();
    const fillerWordsArray: number[] = [];
    const paceArray: number[] = [];

    for (const session of completedSessions) {
      const createdAt = new Date(session.createdAt);
      const day = createdAt.getDay(); // 0 = Sunday, 6 = Saturday
      if (day === 0 || day === 6) weekendCount += 1;

      const hour = createdAt.getHours();
      if (hour >= 0 && hour < 4) nightCount += 1;

      for (const q of session.questions || []) {
        if (q.isEvaluated && q.technicalScore === 100 && q.confidenceScore === 100) {
          hasPerfectScore = true;
        }
        if (q.isEvaluated && q.questionType === "system-design") {
          hasSystemDesign = true;
        }
        if (q.language) languages.add(q.language);
        if (q.questionType) types.add(q.questionType);
        fillerWordsArray.push(q.speechMetrics ? q.speechMetrics.fillerWordCount ?? -1 : -1);
        paceArray.push(q.speechMetrics ? q.speechMetrics.speakingPaceWpm ?? -1 : -1);
      }
    }

    const checkBadge = (achievementDef: any, condition: boolean) => {
      const existing = record.achievements.find(a => a.achievementId === achievementDef.id);
      if (!existing && condition) {
        record.achievements.push({
          achievementId: achievementDef.id,
          progress: achievementDef.target,
          isCompleted: true,
          completedAt: new Date().toISOString()
        });
        record.badges.push({ badgeId: achievementDef.id, earnedAt: new Date().toISOString() });
        newlyEarned.push(achievementDef.id);
        record.xp += XP_REWARDS.BADGE_EARNED;
      }
    };

    // Milestone Badges
    checkBadge(ACHIEVEMENTS.INTERVIEW_10, count >= 10);
    checkBadge(ACHIEVEMENTS.INTERVIEW_50, count >= 50);

    checkBadge(ACHIEVEMENTS.PERFECT_SCORE, hasPerfectScore);
    checkBadge(ACHIEVEMENTS.SYSTEM_DESIGNER, hasSystemDesign);

    // Engagement / Grind Badges
    checkBadge(ACHIEVEMENTS.NIGHT_OWL, nightCount >= 1);
    checkBadge(ACHIEVEMENTS.WEEKEND_WARRIOR, weekendCount >= 3);

    // Skill Badges
    checkBadge(ACHIEVEMENTS.POLYGLOT, languages.size >= 3);
    const hasAllTypes = types.has('frontend') && types.has('backend') && types.has('system-design');
    checkBadge(ACHIEVEMENTS.FULL_STACK_VISIONARY, hasAllTypes);

    // Speech Badges
    const hasZeroFillers = fillerWordsArray.some((fw) => fw === 0);
    checkBadge(ACHIEVEMENTS.SILVER_TONGUE, hasZeroFillers);

    const hasPerfectCadence = paceArray.some((pace) => pace >= 130 && pace <= 150);
    checkBadge(ACHIEVEMENTS.PERFECT_CADENCE, hasPerfectCadence);

    // Streak Badges
    checkBadge(ACHIEVEMENTS.STREAK_3, record.longestStreak >= 3);
    checkBadge(ACHIEVEMENTS.STREAK_7, record.longestStreak >= 7);
    checkBadge(ACHIEVEMENTS.STREAK_30, record.longestStreak >= 30);
    checkBadge(ACHIEVEMENTS.STREAK_100, record.longestStreak >= 100);

    return newlyEarned;
  },

  async updateStreak(userId: string) {
    return withDatabaseLock(`gamification:${userId}`, () => this.updateStreakLocked(userId));
  },

  async updateStreakLocked(userId: string) {
    const record = await this.ensureGamificationRecord(userId);

    const now = new Date();
    const lastActive = new Date(record.lastActivityDate);

    now.setHours(0, 0, 0, 0);
    lastActive.setHours(0, 0, 0, 0);

    const diffTime = now.getTime() - lastActive.getTime();

    if (diffTime < 0) {
      console.warn(`Time anomaly detected: lastActive in the future for user ${userId}. Resetting streak.`);
      record.currentStreak = 1;
      record.lastActivityDate = new Date().toISOString();
      await gamificationRepository.save(record);
      await userRepository.updateFields(userId, {
        streakDays: record.currentStreak,
        lastActiveDate: record.lastActivityDate,
      });
      return { streakDays: record.currentStreak };
    }

    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      record.currentStreak += 1;
      if (record.currentStreak > record.longestStreak) {
        record.longestStreak = record.currentStreak;
      }
    } else if (diffDays > 1) {
      record.currentStreak = 1;
    } else if (diffDays === 0 && record.currentStreak === 0) {
      record.currentStreak = 1;
      if (record.currentStreak > record.longestStreak) {
        record.longestStreak = record.currentStreak;
      }
    }

    record.lastActivityDate = new Date().toISOString();
    await gamificationRepository.save(record);

    await userRepository.updateFields(userId, {
      streakDays: record.currentStreak,
      lastActiveDate: record.lastActivityDate,
    });

    return { streakDays: record.currentStreak };
  },

  async getProfile(userId: string) {
    return await this.ensureGamificationRecord(userId);
  },

  /** Leaderboard straight from the Redis ZSET, hydrated with user names. */
  async getLeaderboard(limit: number = 50) {
    const top = await gamificationRepository.topByXP(limit);

    const entries = await Promise.all(
      top.map(async ({ userId, xp }) => {
        const [record, user] = await Promise.all([
          gamificationRepository.find(userId),
          userRepository.findById(userId),
        ]);
        if (!record || !record.leaderboardOptIn) return null;
        return {
          user: user ? { _id: user._id, name: user.name } : null,
          _id: userId,
          level: record.level,
          xp: xp || record.xp,
        };
      })
    );

    return entries.filter((e): e is NonNullable<typeof e> => e !== null);
  }
};
