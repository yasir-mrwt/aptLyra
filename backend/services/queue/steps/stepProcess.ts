import { getResumeCallbackUrl } from "./callbackUrl.js";
import fs from "fs/promises";
import FormData from "form-data";
import fetch from "node-fetch";
import { createHash } from "crypto";
import * as mammoth from "mammoth";
import { getCachedResult } from "../cacheService.js";
import { getAIServiceUrl } from "./utils.js";

/**
 * STEP 1: processing → parsed
 * Send file to Python AI Service /resume/v2/process (file processing + OCR + LLM parsing)
 */
export const stepProcess = async (resume: any): Promise<any> => {
  const AI_SERVICE_URL = getAIServiceUrl();

  const fileBuffer = await fs.readFile(resume.filePath);

  // Cache key = SHA-256 of the raw file bytes
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
  const cached = await getCachedResult("process", fileHash);
  if (cached) {
    console.log(`[Worker] Cache HIT for process. Firing webhook locally...`);
    const webhookUrl = getResumeCallbackUrl(resume._id);

    // Await callback acknowledgement so rejected cache delivery fails the job
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": process.env.INTERNAL_API_KEY || "" },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
      size: 1024 * 1024,
      body: JSON.stringify({ success: true, data: cached })
    });
    if (!response.ok) throw new Error("Cached resume callback was rejected");

    return { success: true, status: "async_dispatched_via_cache" };
  }

  let finalBuffer = fileBuffer;
  let finalFilename = resume.originalFilename;
  let finalContentType = resume.fileType === "pdf" ? "application/pdf" : "text/plain";

  // Process .docx natively to text using Mammoth
  if (resume.fileType === "docx" || resume.originalFilename.toLowerCase().endsWith(".docx")) {
    console.log(`[Worker] Extracting text from DOCX using mammoth for ${resume._id}...`);
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    finalBuffer = Buffer.from(result.value, "utf8");
    finalFilename = resume.originalFilename.replace(/\.docx$/i, ".txt");
    finalContentType = "text/plain";
  }

  const webhookUrl = getResumeCallbackUrl(resume._id);

  // Send to the AI service, retrying on cold-start gateway errors. On free
  // hosting the AI service can be asleep and take ~50s to wake, during which
  // the platform returns 502/503/504 — so we retry a few times with a wait
  // instead of failing the whole resume on the first cold request.
  const MAX_ATTEMPTS = 4;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // FormData is a one-shot stream, so it must be rebuilt for every attempt.
    const formData = new FormData();
    formData.append("file", finalBuffer, {
      filename: finalFilename,
      contentType: finalContentType,
    });
    formData.append("webhook_url", webhookUrl);

    const headers: any = typeof formData.getHeaders === "function" ? formData.getHeaders() : {};
    if (typeof formData.getLengthSync === "function") {
      headers["Content-Length"] = formData.getLengthSync().toString();
    }
    headers["X-API-Key"] = process.env.INTERNAL_API_KEY || "";

    console.log(`[Worker] STEP 1/4: Sending resume ${resume._id} for async processing (attempt ${attempt}/${MAX_ATTEMPTS})...`);

    let response: any = null;
    try {
      response = await fetch(`${AI_SERVICE_URL}/resume/v2/process-async`, {
        method: "POST",
        body: formData,
        headers,
        signal: AbortSignal.timeout(90_000),
        redirect: "error",
        size: 1024 * 1024,
      });
    } catch (err: any) {
      // Network-level failure (connection reset while the service cold-boots).
      lastError = err?.message || String(err);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Could not reach AI service after ${MAX_ATTEMPTS} attempts: ${lastError}`);
      }
      await new Promise((r) => setTimeout(r, attempt * 15000));
      continue;
    }

    if (response.ok) {
      return { success: true, status: "async_dispatched" };
    }

    lastError = `${response.status} ${(await response.text()).slice(0, 200)}`;

    // Retry only on gateway / cold-start errors; fail fast on real 4xx.
    const isColdStart = [502, 503, 504].includes(response.status);
    if (!isColdStart || attempt === MAX_ATTEMPTS) {
      throw new Error(`Processing service failed (${lastError})`);
    }

    const waitMs = attempt * 15000; // 15s, 30s, 45s — give the service time to wake
    console.log(`[Worker] AI service not ready (${lastError}). Waiting ${waitMs / 1000}s before retry...`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw new Error(`Processing service failed: ${lastError}`);
};
