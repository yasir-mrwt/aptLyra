/**
 * @file models/Session.ts
 * @description Interview Session repository backed by Neon PostgreSQL.
 *
 * The questions array (with embedded evaluations, speech metrics and
 * follow-up markers) lives in a JSONB column — flexible like a document
 * store, indexed and relational where it matters (user_id, status, dates).
 */

import crypto from "crypto";
import {publicEvaluationSession} from "../evaluation/readModel.js";
import {reviewedAggregate,type EvaluationView} from "../evaluation/contracts.js";
import { query, withDatabaseLock } from "../config/db.js";

export interface ISpeechMetrics {
  fillerWordCount: number;
  fillerWords: { word: string; count: number }[];
  speakingPaceWpm: number;
  paceRating: string;
  totalPauseDurationMs: number;
  pauseCount: number;
  clarityScore: number;
}

export interface IQuestion {
  evaluation?: EvaluationView;
  primaryCompetency?: string;
  followUpConceptId?: string;
  parentEvaluationId?: string;
  planItemId?: string;
  questionVersionId?: string;
  category?: string;
  evidenceUnavailable?: boolean;
  questionText: string;
  questionType: "oral" | "coding" | "system-design";
  idealAnswer: string;
  userAnswerText?: string;
  userSubmittedCode?: string;
  userSubmittedDiagram?: string;
  diagramImageUrl?: string;
  language?: string;
  isSubmitted: boolean;
  isEvaluated: boolean;
  technicalScore?: number;
  confidenceScore?: number;
  aiFeedback?: string;
  speechMetrics?: ISpeechMetrics;
  speechMetricsStatus?: "available" | "unavailable";
  processingError?: string;
  followUpPending?: boolean;
  /** Index of the original question this follow-up probes (cross-questioning). */
  followUpOf?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ISession {
  scoringVersion?: "legacy"|"rubric-v1";
  reviewedSummary?: ReturnType<typeof reviewedAggregate>;
  planId?: string;
  _id: string;
  user: string;
  role: string;
  level: string;
  interviewType: "oral-only" | "coding-mix" | "company-specific";
  company?: string;
  companyTrack?: string;
  status: "pending" | "in-progress" | "completed" | "cancelled" | "failed";
  overallScore: number | null;
  metrics: {
    avgTechnical: number | null;
    avgConfidence: number | null;
  };
  resumeId?: string;
  questions: IQuestion[];
  startTime: string;
  endTime?: string | null;
  createdAt: string;
  updatedAt: string;
}

const toISO = (v: any): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : v;

const rowToSession = (row: any): ISession => ({
  scoringVersion: row.scoring_version || "legacy",
  reviewedSummary: row.scoring_version === "rubric-v1" ? reviewedAggregate(row.questions || []) : undefined,
  planId: row.interview_plan_id || undefined,
  _id: row.id,
  user: row.user_id,
  role: row.role,
  level: row.level,
  interviewType: row.interview_type,
  company: row.company || undefined,
  companyTrack: row.company_track || undefined,
  status: row.status,
  overallScore: row.scoring_version === "rubric-v1" ? reviewedAggregate(row.questions || []).technicalScore : row.overall_score,
  metrics: {
    avgTechnical: row.scoring_version === "rubric-v1" ? reviewedAggregate(row.questions || []).technicalScore : row.avg_technical,
    avgConfidence: row.scoring_version === "rubric-v1" ? null : row.avg_confidence,
  },
  resumeId: row.resume_id || undefined,
  questions: row.questions || [],
  startTime: toISO(row.start_time) as string,
  endTime: toISO(row.end_time),
  createdAt: toISO(row.created_at) as string,
  updatedAt: toISO(row.updated_at) as string,
});

/** Database transaction lock protects the full JSONB read/modify/write cycle. */
export const withSessionLock = <T>(sessionId: string, fn: () => Promise<T>): Promise<T> =>
  withDatabaseLock(`session:${sessionId}`, fn);

export const sessionRepository = {
  async create(data: {
    user: string;
    role: string;
    level: string;
    interviewType: ISession["interviewType"];
    company?: string;
    companyTrack?: string;
    resumeId?: string;
    status?: ISession["status"];
  }): Promise<ISession> {
    if (data.interviewType === "company-specific" && (!data.company || !data.companyTrack)) {
      throw new Error(
        "Both 'company' and 'companyTrack' are required when interviewType is 'company-specific'."
      );
    }

    const { rows } = await query(
      `INSERT INTO sessions (id, user_id, role, level, interview_type, company, company_track, resume_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        crypto.randomUUID(),
        data.user.toString(),
        data.role,
        data.level,
        data.interviewType,
        data.company || null,
        data.companyTrack || null,
        data.resumeId || null,
        data.status || "pending",
      ]
    );
    return rowToSession(rows[0]);
  },

  async findById(id: string): Promise<ISession | null> {
    if (!id) return null;
    const { rows } = await query("SELECT * FROM sessions WHERE id = $1", [id]);
    return rows[0] ? rowToSession(rows[0]) : null;
  },

  async findByIdForUser(id: string, userId: string): Promise<ISession | null> {
    const session = await this.findById(id);
    if (!session || session.user !== userId.toString()) return null;
    return session;
  },

  async save(session: ISession): Promise<ISession> {
    if(session.scoringVersion === "rubric-v1") {
      session.reviewedSummary=reviewedAggregate(session.questions);
      await query("UPDATE sessions SET reviewed_summary=$2 WHERE id=$1",[session._id,JSON.stringify(session.reviewedSummary)]);
    }
    const { rows } = await query(
      `UPDATE sessions
       SET status = $2, overall_score = $3, avg_technical = $4, avg_confidence = $5,
           questions = $6::jsonb, start_time = $7, end_time = $8, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        session._id,
        session.status,
        Math.round(session.overallScore || 0),
        Math.round(session.metrics?.avgTechnical || 0),
        Math.round(session.metrics?.avgConfidence || 0),
        JSON.stringify(session.questions || []),
        session.startTime,
        session.endTime || null,
      ]
    );
    if (!rows[0]) throw new Error("Session not found");
    const saved = rowToSession(rows[0]);
    Object.assign(session, saved);
    return saved;
  },

  async delete(session: ISession): Promise<void> {
    await query("DELETE FROM sessions WHERE id = $1", [session._id]);
  },

  async countForUser(userId: string): Promise<number> {
    const { rows } = await query(
      "SELECT COUNT(*)::int AS count FROM sessions WHERE user_id = $1",
      [userId.toString()]
    );
    return rows[0].count;
  },

  async countCompletedForUser(userId: string): Promise<number> {
    const { rows } = await query(
      "SELECT COUNT(*)::int AS count FROM sessions WHERE user_id = $1 AND status = 'completed'",
      [userId.toString()]
    );
    return rows[0].count;
  },

  /** Newest-first page of sessions for the dashboard (questions stripped). */
  async listForUser(
    userId: string,
    page: number,
    limit: number
  ): Promise<Omit<ISession, "questions">[]> {
    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT * FROM sessions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId.toString(), limit, offset]
    );
    return Promise.all(rows.map(async (r) => {
      const { questions: _questions, ...rest } = await publicEvaluationSession(rowToSession(r));
      void _questions; // intentionally omit the large question payload from lists
      return rest;
    }));
  },

  /** All sessions for a user, full documents (used by analytics + badges). */
  async listAllForUser(userId: string): Promise<ISession[]> {
    const { rows } = await query(
      "SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId.toString()]
    );
    return rows.map(rowToSession);
  },

  async listCompletedForUser(userId: string): Promise<ISession[]> {
    const { rows } = await query(
      "SELECT * FROM sessions WHERE user_id = $1 AND status = 'completed' ORDER BY created_at DESC",
      [userId.toString()]
    );
    return Promise.all(rows.map(r=>publicEvaluationSession(rowToSession(r))));
  },

  /**
   * Compute overall proficiency metrics for a session.
   * Unevaluated questions count as 0 so partially-answered sessions are
   * penalised, not ignored.
   */
  calculateScoreSummary(session: ISession): {
    overallScore: number | null;
    avgTechnical: number | null;
    avgConfidence: number | null;
  } {
    const questions = session.questions || [];
    if(session.scoringVersion === "rubric-v1") {
      const aggregate=reviewedAggregate(questions);
      return {overallScore:aggregate.technicalScore,avgTechnical:aggregate.technicalScore,avgConfidence:null};
    }
    if (questions.length === 0) {
      return { overallScore: 0, avgTechnical: 0, avgConfidence: 0 };
    }

    const technical =
      questions.reduce((sum, q) => sum + (q.isEvaluated ? q.technicalScore || 0 : 0), 0) /
      questions.length;
    const confidence =
      questions.reduce((sum, q) => sum + (q.isEvaluated ? q.confidenceScore || 0 : 0), 0) /
      questions.length;

    return {
      overallScore: Math.round((technical + confidence) / 2),
      avgTechnical: Math.round(technical),
      avgConfidence: Math.round(confidence),
    };
  },
};
