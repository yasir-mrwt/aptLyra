/**
 * @file src/services/aiService.ts
 * @description Proxy service for communicating with the Python FastAPI AI microservice.
 * Handles question generation, transcription, and answer evaluation.
 */

import fetch from "node-fetch";
import FormData from "form-data";
import dotenv from "dotenv";
import { SpeechAnalysisResult } from "../types/SpeechAnalysisResult.js";

if (process.env.NODE_ENV !== "test") dotenv.config();

const API_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

const providerCodes = new Set(["provider_model_unavailable", "provider_authentication", "provider_rate_limited", "provider_timeout", "provider_unavailable", "tts_terms_required", "invalid_provider_audio"]);
export class AIServiceError extends Error {
  constructor(public code: string, public upstreamStatus: number) { super("AI operation unavailable. Please retry."); }
}
async function providerError(response: any) {
  let code = "provider_unavailable";
  try {
    const detail = (await response.json()).detail;
    if (detail && typeof detail === "object" && providerCodes.has(detail.code)) code = detail.code;
  } catch { /* Do not expose untrusted upstream text. */ }
  return new AIServiceError(code, response.status);
}

/**
 * Utility for asynchronous delayed execution.
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Enhanced fetch with retry logic and exponential backoff.
 */
const fetchWithRetry = async (
  url: string,
  options: any = {},
  retries: number = 2,
  backoff: number = 2000
): Promise<any> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(90_000), size: 10 * 1024 * 1024, redirect: "error" });
      // Retry on 429 (Rate Limit) and 50x (Server Errors)
      if (response.ok || (response.status >= 400 && ![429, 502, 503, 504].includes(response.status)) || i === retries - 1) {
        return response;
      }
      await response.arrayBuffer(); // Discard the bounded error body before retrying.
      throw new AIServiceError("provider_unavailable", response.status);
    } catch (error) {
      lastError = error instanceof AIServiceError ? error : new AIServiceError("provider_timeout", 504);
      if (i < retries - 1) {
        console.warn(`AI request attempt ${i + 1} failed. Retrying in ${backoff}ms...`);
        await wait(backoff);
        backoff *= 2; // Exponential backoff
      }
    }
  }
  throw lastError;
};

import {
  GenerateQuestionsParams,
  GenerateQuestionsResponse,
  EvaluateAnswerParams,
  EvaluateAnswerResponse
} from "../types/aiService.js";

/**
 * Service to handle all interactions with the Python AI microservice.
 */
export const aiService = {
  async extractInterviewExperience(input: {sourceText:string;role:string;company:string|null;occurredOn:string|null;datePrecision:"day"|"unknown";roundType:string|null;topics:string[];allowedCompetencies:string[]}): Promise<unknown> {
    const response=await fetchWithRetry(`${API_SERVICE_URL}/internal/content/extract`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":process.env.INTERNAL_API_KEY || ""},body:JSON.stringify(input)},1);
    if(!response.ok)throw await providerError(response);return response.json();
  },
  async reviewEditorialCandidate(input: {question:string;allowedCompetencies:string[];allowedCategories:string[];evidenceText:string|null;similarQuestions:string[]}): Promise<unknown> {
    const response=await fetchWithRetry(`${API_SERVICE_URL}/internal/content/review`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":process.env.INTERNAL_API_KEY || ""},body:JSON.stringify(input)},1);
    if(!response.ok)throw await providerError(response);return response.json();
  },
  async evaluateRubric(input: import("../evaluation/contracts.js").EvaluationInput): Promise<unknown> {
    const response=await fetchWithRetry(`${API_SERVICE_URL}/internal/rubrics/evaluate`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":process.env.INTERNAL_API_KEY || ""},body:JSON.stringify(input)},1);
    if(!response.ok)throw await providerError(response);return response.json();
  },
  async draftRubric(question:string,references:import("../evaluation/contracts.js").Reference[]):Promise<unknown> {
    const response=await fetchWithRetry(`${API_SERVICE_URL}/internal/rubrics/draft`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":process.env.INTERNAL_API_KEY || ""},body:JSON.stringify({question,references})},1);
    if(!response.ok)throw await providerError(response);return response.json();
  },
  /**
   * Request a list of interview questions from the AI service.
   */
  generateQuestions: async (params: GenerateQuestionsParams): Promise<GenerateQuestionsResponse> => {
    const { role, level, interviewType, count, resumeText, company, companyTrack } = params;

    const response = await fetchWithRetry(`${API_SERVICE_URL}/generate-questions`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-API-Key": process.env.INTERNAL_API_KEY || ""
      },
      body: JSON.stringify({
        role,
        level,
        interview_type: interviewType,
        count,
        resume_text: resumeText,
        company,
        company_track: companyTrack,
      }),
    });

    if (!response.ok) {
      throw await providerError(response);
    }

    const data = await response.json() as GenerateQuestionsResponse;
    if (!Array.isArray(data.questions) || data.questions.length !== count || data.questions.some(q =>
      typeof q.question !== "string" || !q.question.trim() || typeof q.ideal_answer !== "string" || !q.ideal_answer.trim() ||
      !["oral", "coding", "system-design"].includes(q.question_type))) throw new Error("Invalid question generation response");
    return data;
  },

  /**
   * Transcribe an audio blob using the AI service.
   */
  transcribeAudio: async (audioBuffer: Buffer): Promise<string> => {
    const formData = new FormData();
    formData.append("file", audioBuffer, {
      filename: "audio.webm",
      contentType: "audio/webm",
    });

    const response = await fetchWithRetry(`${API_SERVICE_URL}/transcribe`, {
      method: "POST",
      body: formData,
      headers: {
        ...formData.getHeaders(),
        "X-API-Key": process.env.INTERNAL_API_KEY || ""
      },
    }, 1);

    if (!response.ok) {
      throw await providerError(response);
    }

    const data = (await response.json()) as { transcription?: string };
    if (typeof data.transcription !== "string" || !data.transcription.trim()) throw new Error("No valid transcript returned. Please record again.");
    return data.transcription.trim();
  },

  /**
   * Evaluate a user's answer (verbal and/or code).
   */
  evaluateAnswer: async (params: EvaluateAnswerParams): Promise<EvaluateAnswerResponse> => {
    const response = await fetchWithRetry(`${API_SERVICE_URL}/evaluate`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-API-Key": process.env.INTERNAL_API_KEY || ""
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw await providerError(response);
    }

    const data = await response.json() as EvaluateAnswerResponse;
    if ([data.technical_score, data.confidence_score].some(score => typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) ||
      typeof data.ai_feedback !== "string" || !data.ai_feedback.trim() || typeof data.ideal_answer !== "string" || !data.ideal_answer.trim()) {
      throw new Error("Invalid evaluation response. Please retry.");
    }
    return data;
  },

  /**
   * Generate ONE probing follow-up question after a weak answer.
   */
  generateFollowUp: async (params: {
    question: string;
    userAnswer: string;
    aiFeedback: string;
    role: string;
    level: string;
  }, attempts=2): Promise<{ question: string; ideal_answer: string; question_type: string }> => {
    const response = await fetchWithRetry(`${API_SERVICE_URL}/generate-followup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.INTERNAL_API_KEY || ""
      },
      body: JSON.stringify({
        question: params.question,
        user_answer: params.userAnswer,
        ai_feedback: params.aiFeedback,
        role: params.role,
        level: params.level,
      }),
    }, attempts);

    if (!response.ok) {
      throw await providerError(response);
    }

    const data = await response.json() as { question: string; ideal_answer: string; question_type: string };
    if (typeof data.question !== "string" || !data.question.trim() || typeof data.ideal_answer !== "string" || !data.ideal_answer.trim() || data.question_type !== "oral") {
      throw new Error("Invalid follow-up response");
    }
    return data;
  },

  /**
   * Synthesize the AI interviewer's voice (Groq PlayAI TTS via the Python service).
   * Returns WAV audio bytes.
   */
  synthesizeSpeech: async (text: string): Promise<Buffer> => {
    const response = await fetchWithRetry(`${API_SERVICE_URL}/speech/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.INTERNAL_API_KEY || ""
      },
      body: JSON.stringify({ text }),
    }, 1); // no retry spam for TTS — client falls back to browser speech

    if (!response.ok) {
      throw await providerError(response);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length < 44 || audio.length > 10 * 1024 * 1024 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE")
      throw new AIServiceError("invalid_provider_audio", 502);
    return audio;
  },

  /**
   * Analyze speech audio for pace, pauses, and filler words.
   * Transcribes if transcript is not provided.
   */
  analyzeSpeech: async (audioBuffer: Buffer, transcript?: string, filename = "audio.webm"): Promise<SpeechAnalysisResult> => {
    const formData = new FormData();
    const extension = filename.split(".").pop()?.toLowerCase() || "webm";
    const contentTypes: Record<string, string> = { webm: "audio/webm", wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", m4a: "audio/mp4" };
    if (!contentTypes[extension]) throw new Error("Unsupported audio format");
    formData.append("audio", audioBuffer, { filename: `audio.${extension}`, contentType: contentTypes[extension] });
    if (transcript) {
      formData.append("transcript", transcript);
    }

    const response = await fetchWithRetry(`${API_SERVICE_URL}/speech/analyze`, {
      method: "POST",
      body: formData,
      headers: {
        ...formData.getHeaders(),
        "X-API-Key": process.env.INTERNAL_API_KEY || ""
      },
    }, 1);

    if (!response.ok) {
      throw await providerError(response);
    }

    const data = await response.json() as SpeechAnalysisResult;
    if (typeof data.transcript !== "string" || !data.transcript.trim()) throw new Error("No speech detected. Please record again.");
    if (!["available", "unavailable"].includes(data.metrics_status) || (data.metrics_status === "available" &&
      (!data.metrics || ["duration_seconds", "speaking_time_seconds", "pause_time_seconds", "pause_count", "word_count", "pace_wpm", "filler_words_count"].some(key => {
        const value = (data.metrics as any)[key];
        return typeof value !== "number" || !Number.isFinite(value) || value < 0;
      }))) || (data.metrics_status === "unavailable" && data.metrics !== null)) {
      throw new Error("Invalid speech analysis response. Please retry.");
    }
    return data;
  },
};
