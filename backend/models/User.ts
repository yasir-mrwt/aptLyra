/**
 * @file models/User.ts
 * @description User repository backed by Neon PostgreSQL (primary datastore).
 *
 * Table: users — email and google_id carry UNIQUE constraints, so index
 * bookkeeping that Redis needed is handled natively by Postgres.
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import { query } from "../config/db.js";

export interface IUser {
  _id: string;
  name: string;
  email: string;
  password?: string;
  googleId?: string;
  avatarUrl?: string;
  preferredRole: string;
  // --- Gamification fields (denormalized cache) ---
  // These fields mirror the Gamification record for quick access.
  // Updates MUST be handled alongside Gamification records (see gamificationService.ts).
  xp: number;
  currentLevel: number;
  streakDays: number;
  lastActiveDate: string;
  createdAt: string;
  updatedAt: string;
}

const toISO = (v: any): string => (v instanceof Date ? v.toISOString() : v);

const rowToUser = (row: any): IUser => ({
  _id: row.id,
  name: row.name,
  email: row.email,
  password: row.password || undefined,
  googleId: row.google_id || undefined,
  avatarUrl: row.avatar_url || undefined,
  preferredRole: row.preferred_role,
  xp: row.xp,
  currentLevel: row.current_level,
  streakDays: row.streak_days,
  lastActiveDate: toISO(row.last_active_date),
  createdAt: toISO(row.created_at),
  updatedAt: toISO(row.updated_at),
});

export const userRepository = {
  async create(data: {
    name: string;
    email: string;
    password?: string;
    /** Pre-hashed bcrypt password (used by the OTP flow, which hashes early). */
    passwordHash?: string;
    googleId?: string;
    avatarUrl?: string;
    preferredRole?: string;
  }): Promise<IUser> {
    const id = crypto.randomUUID();
    const email = data.email.trim().toLowerCase();

    let hashedPassword: string | null = data.passwordHash || null;
    if (!hashedPassword && data.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(data.password, salt);
    }

    try {
      const { rows } = await query(
        `INSERT INTO users (id, name, email, password, google_id, avatar_url, preferred_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, data.name, email, hashedPassword, data.googleId || null, data.avatarUrl || null, data.preferredRole || "Full Stack Developer"]
      );
      return rowToUser(rows[0]);
    } catch (err: any) {
      if (err.code === "23505") {
        // unique_violation on email/google_id
        throw new Error("User already exists");
      }
      throw err;
    }
  },

  async findById(id: string): Promise<IUser | null> {
    if (!id) return null;
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async findByEmail(email: string): Promise<IUser | null> {
    if (!email) return null;
    const { rows } = await query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async findByGoogleId(googleId: string): Promise<IUser | null> {
    if (!googleId) return null;
    const { rows } = await query("SELECT * FROM users WHERE google_id = $1", [googleId]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  /**
   * Persist changes on a user object. Re-hashes when a plaintext password is
   * supplied; the email UNIQUE constraint guards against duplicate takeover.
   */
  async save(
    user: IUser,
    options: { plainPassword?: string; previousEmail?: string } = {}
  ): Promise<IUser> {
    if (options.plainPassword) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(options.plainPassword, salt);
    }

    user.email = user.email.trim().toLowerCase();

    try {
      const { rows } = await query(
        `UPDATE users
         SET name = $2, email = $3, password = $4, google_id = $5, avatar_url = $6, preferred_role = $7,
             xp = $8, current_level = $9, streak_days = $10, last_active_date = $11,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          user._id,
          user.name,
          user.email,
          user.password || null,
          user.googleId || null,
          user.avatarUrl || null,
          user.preferredRole,
          user.xp,
          user.currentLevel,
          user.streakDays,
          user.lastActiveDate,
        ]
      );
      if (!rows[0]) throw new Error("User not found");
      const saved = rowToUser(rows[0]);
      Object.assign(user, saved);
      return saved;
    } catch (err: any) {
      if (err.code === "23505") {
        throw new Error("Email is already in use");
      }
      throw err;
    }
  },

  /** Merge a partial update into the stored user document. */
  async updateFields(id: string, fields: Partial<IUser>): Promise<IUser | null> {
    const user = await this.findById(id);
    if (!user) return null;
    Object.assign(user, fields);
    return this.save(user);
  },

  async matchPassword(user: IUser, password: string): Promise<boolean> {
    if (!user.password) return false;
    return bcrypt.compare(password, user.password);
  },

  /** Strip sensitive fields before attaching to req.user / API responses. */
  toSafeObject(user: IUser): Omit<IUser, "password"> {
    const { password: _password, ...safe } = user;
    void _password; // password must never appear in the public user object
    return safe;
  },
};
