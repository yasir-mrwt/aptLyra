/**
 * @file models/Resume.ts
 * @description Resume repository backed by Neon PostgreSQL.
 *
 * Parsed data, analysis reports and JD-match reports are JSONB columns —
 * the ML pipeline writes arbitrary structured output without migrations.
 */

import crypto from "crypto";
import { query } from "../config/db.js";

export type ResumeStatus =
  | "pending"
  | "processing"
  | "parsed"
  | "analyzing"
  | "matching"
  | "completed"
  | "failed"
  | "invalid_document";

export interface IResume {
  _id: string;
  user: string;
  originalFilename: string;
  storedFilename: string;
  fileType: "pdf" | "docx" | "txt";
  fileSize: number;
  filePath: string;
  status: ResumeStatus;
  jobId?: string | null;
  parsedData?: Record<string, any>;
  analysisReport?: Record<string, any>;
  jdText?: string | null;
  jdMatchReport?: Record<string, any>;
  scores: {
    ats: number;
    overall: number;
    jdMatch: number;
  };
  error?: string | null;
  metrics?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const toISO = (v: any): string => (v instanceof Date ? v.toISOString() : v);

const rowToResume = (row: any): IResume => ({
  _id: row.id,
  user: row.user_id,
  originalFilename: row.original_filename,
  storedFilename: row.stored_filename,
  fileType: row.file_type,
  fileSize: row.file_size,
  filePath: row.file_path,
  status: row.status,
  jobId: row.job_id,
  parsedData: row.parsed_data || {},
  analysisReport: row.analysis_report || {},
  jdText: row.jd_text,
  jdMatchReport: row.jd_match_report || {},
  scores: row.scores || { ats: 0, overall: 0, jdMatch: 0 },
  error: row.error,
  metrics: row.metrics || {},
  createdAt: toISO(row.created_at),
  updatedAt: toISO(row.updated_at),
});

export const resumeRepository = {
  async create(data: {
    user: string;
    originalFilename: string;
    storedFilename: string;
    fileType: IResume["fileType"];
    fileSize: number;
    filePath: string;
    status?: ResumeStatus;
    jdText?: string | null;
  }): Promise<IResume> {
    const { rows } = await query(
      `INSERT INTO resumes (id, user_id, original_filename, stored_filename, file_type, file_size, file_path, status, jd_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        crypto.randomUUID(),
        data.user.toString(),
        data.originalFilename,
        data.storedFilename,
        data.fileType,
        data.fileSize,
        data.filePath,
        data.status || "pending",
        data.jdText || null,
      ]
    );
    return rowToResume(rows[0]);
  },

  async findById(id: string): Promise<IResume | null> {
    if (!id) return null;
    const { rows } = await query("SELECT * FROM resumes WHERE id = $1", [id]);
    return rows[0] ? rowToResume(rows[0]) : null;
  },

  async save(resume: IResume): Promise<IResume> {
    const { rows } = await query(
      `UPDATE resumes
       SET status = $2, job_id = $3, parsed_data = $4::jsonb, analysis_report = $5::jsonb,
           jd_text = $6, jd_match_report = $7::jsonb, scores = $8::jsonb, error = $9,
           metrics = $10::jsonb, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        resume._id,
        resume.status,
        resume.jobId || null,
        JSON.stringify(resume.parsedData || {}),
        JSON.stringify(resume.analysisReport || {}),
        resume.jdText || null,
        JSON.stringify(resume.jdMatchReport || {}),
        JSON.stringify(resume.scores || { ats: 0, overall: 0, jdMatch: 0 }),
        resume.error || null,
        JSON.stringify(resume.metrics || {}),
      ]
    );
    if (!rows[0]) throw new Error("Resume not found");
    const saved = rowToResume(rows[0]);
    Object.assign(resume, saved);
    return saved;
  },

  async delete(resume: IResume): Promise<void> {
    await query("DELETE FROM resumes WHERE id = $1", [resume._id]);
  },

  async countForUser(userId: string): Promise<number> {
    const { rows } = await query(
      "SELECT COUNT(*)::int AS count FROM resumes WHERE user_id = $1",
      [userId.toString()]
    );
    return rows[0].count;
  },

  /** Newest-first page of resumes for the history view. */
  async listForUser(userId: string, skip: number, limit: number): Promise<IResume[]> {
    const { rows } = await query(
      `SELECT * FROM resumes WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId.toString(), limit, skip]
    );
    return rows.map(rowToResume);
  },
};
