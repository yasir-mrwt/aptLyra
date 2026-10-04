/**
 * @file models/Gamification.ts
 * @description Gamification repository backed by Neon PostgreSQL.
 *
 * Badges/achievements are JSONB arrays; the leaderboard is a partial index
 * on xp (WHERE leaderboard_opt_in) so `topByXP` is a straight ORDER BY.
 */

import { query } from "../config/db.js";

export interface IBadge {
  badgeId: string;
  earnedAt: string;
}

export interface IAchievement {
  achievementId: string;
  progress: number;
  isCompleted: boolean;
  completedAt?: string;
}

export interface IGamification {
  user: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string;
  xp: number;
  level: number;
  badges: IBadge[];
  achievements: IAchievement[];
  leaderboardOptIn: boolean;
  createdAt: string;
  updatedAt: string;
}

const MAX_COLLECTION_SIZE = 100;

const toISO = (v: any): string => (v instanceof Date ? v.toISOString() : v);

const rowToRecord = (row: any): IGamification => ({
  user: row.user_id,
  currentStreak: row.current_streak,
  longestStreak: row.longest_streak,
  lastActivityDate: toISO(row.last_activity_date),
  xp: row.xp,
  level: row.level,
  badges: row.badges || [],
  achievements: row.achievements || [],
  leaderboardOptIn: row.leaderboard_opt_in,
  createdAt: toISO(row.created_at),
  updatedAt: toISO(row.updated_at),
});

export const gamificationRepository = {
  async find(userId: string): Promise<IGamification | null> {
    const { rows } = await query("SELECT * FROM gamification WHERE user_id = $1", [
      userId.toString(),
    ]);
    return rows[0] ? rowToRecord(rows[0]) : null;
  },

  async create(data: {
    user: string;
    xp?: number;
    level?: number;
    currentStreak?: number;
    longestStreak?: number;
    lastActivityDate?: string;
  }): Promise<IGamification> {
    const { rows } = await query(
      `INSERT INTO gamification (user_id, xp, level, current_streak, longest_streak, last_activity_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [
        data.user.toString(),
        data.xp || 0,
        data.level || 1,
        data.currentStreak || 0,
        data.longestStreak || 0,
        data.lastActivityDate || new Date().toISOString(),
      ]
    );
    return rowToRecord(rows[0]);
  },

  async save(record: IGamification): Promise<IGamification> {
    if (record.badges.length > MAX_COLLECTION_SIZE) {
      throw new Error(`Exceeds the limit of ${MAX_COLLECTION_SIZE} badges`);
    }
    if (record.achievements.length > MAX_COLLECTION_SIZE) {
      throw new Error(`Exceeds the limit of ${MAX_COLLECTION_SIZE} achievements`);
    }

    const { rows } = await query(
      `UPDATE gamification
       SET current_streak = $2, longest_streak = $3, last_activity_date = $4,
           xp = $5, level = $6, badges = $7::jsonb, achievements = $8::jsonb,
           leaderboard_opt_in = $9, updated_at = now()
       WHERE user_id = $1
       RETURNING *`,
      [
        record.user.toString(),
        record.currentStreak,
        record.longestStreak,
        record.lastActivityDate,
        record.xp,
        record.level,
        JSON.stringify(record.badges || []),
        JSON.stringify(record.achievements || []),
        record.leaderboardOptIn,
      ]
    );
    if (!rows[0]) throw new Error("Gamification record not found");
    const saved = rowToRecord(rows[0]);
    Object.assign(record, saved);
    return saved;
  },

  /** Top N leaderboard entries: [{ userId, xp }] — highest XP first. */
  async topByXP(limit: number): Promise<{ userId: string; xp: number }[]> {
    const { rows } = await query(
      `SELECT user_id, xp FROM gamification
       WHERE leaderboard_opt_in = true
       ORDER BY xp DESC LIMIT $1`,
      [limit]
    );
    return rows.map((r) => ({ userId: r.user_id, xp: r.xp }));
  },
};
