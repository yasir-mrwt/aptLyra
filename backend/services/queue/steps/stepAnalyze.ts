import fetch from "node-fetch";
import { getCachedResult, setCachedResult } from "../cacheService.js";
import { getAIServiceUrl } from "./utils.js";

/**
 * STEP 2: parsed → analyzing
 * Send parsed text to Python AI Service /resume/v2/analyze (skills + audit + scoring + recommendations + report)
 */
export const stepAnalyze = async (resume: any): Promise<any> => {
  const AI_SERVICE_URL = getAIServiceUrl();

  // Cache key = hash of resume text + JD (insights are JD-aware, so the same
  // resume against a different JD must produce a fresh analysis)
  const fingerprint = `${resume.parsedData.rawText || ""}::jd::${resume.jdText || ""}`;
  const cached = await getCachedResult("analyze", fingerprint);
  if (cached) return cached;

  console.log(`[Worker] STEP 2/4: Sending resume ${resume._id} for modular analysis...`);
  const response = await fetch(`${AI_SERVICE_URL}/resume/v2/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.INTERNAL_API_KEY || ""
    },
    body: JSON.stringify({
      raw_text: resume.parsedData.rawText,
      parsed_profile: resume.parsedData.parsedProfile || {},
      jd_text: resume.jdText || null,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Analysis service failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as any;
  await setCachedResult("analyze", fingerprint, data);
  return data;
};
