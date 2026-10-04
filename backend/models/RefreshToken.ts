/**
 * @file models/RefreshToken.ts
 * @description Refresh-token store backed by Neon PostgreSQL.
 *
 * Expired rows are lazily purged on lookup (Postgres has no TTL); the
 * controller also double-checks `expiresAt` before honouring a token.
 */

import { query } from "../config/db.js";

export interface IRefreshToken {
  userId: string;
  token: string;
  expiresAt: string;
}

const rowToToken = (row: any): IRefreshToken => ({
  userId: row.user_id,
  token: row.token,
  expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
});

export const refreshTokenRepository = {
  async create(userId: string, token: string, expiresAt: Date): Promise<IRefreshToken> {
    // Opportunistic cleanup of this user's expired tokens
    await query("DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at < now()", [userId]);

    const { rows } = await query(
      `INSERT INTO refresh_tokens (token, user_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [token, userId, expiresAt.toISOString()]
    );
    return rowToToken(rows[0]);
  },

  async find(token: string): Promise<IRefreshToken | null> {
    if (!token) return null;
    const { rows } = await query(
      "SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > now()",
      [token]
    );
    return rows[0] ? rowToToken(rows[0]) : null;
  },

  async delete(token: string): Promise<void> {
    if (!token) return;
    await query("DELETE FROM refresh_tokens WHERE token = $1", [token]);
  },

  /** Revoke every session for a user (called after a password reset). */
  async deleteAllForUser(userId: string): Promise<void> {
    if (!userId) return;
    await query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
  },
};
