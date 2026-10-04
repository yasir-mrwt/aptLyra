import fetch from "node-fetch";
import { getAIServiceUrl } from "./utils.js";
import { emitResumeStatus } from "../../socketService.js";

/**
 * Connect to the Python AI Service /resume/v2/stream-feedback
 * and emit socket.io events for each chunk.
 */
export const stepStreamFeedback = async (
  resume: any,
  userId: string,
  ioInstance: any
): Promise<void> => {
  const AI_SERVICE_URL = getAIServiceUrl();
  const rawText = resume.parsedData?.rawText;

  if (!rawText) return;

  console.log(`[Worker] STEP STREAM: Sending resume ${resume._id} for streaming feedback...`);

  try {
    const response = await fetch(`${AI_SERVICE_URL}/resume/v2/stream-feedback`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-API-Key": process.env.INTERNAL_API_KEY || ""
      },
      body: JSON.stringify({ raw_text: rawText }),
    });

    if (!response.ok) {
      console.error(`[Worker] Stream failed: ${response.status}`);
      return;
    }

    if (!response.body) {
      console.error("[Worker] Stream failed: No response body");
      return;
    }

    // Node-fetch response.body is a NodeJS.ReadableStream
    response.body.on("data", (chunk: Buffer) => {
      const textChunk = chunk.toString("utf8");
      
      if (ioInstance) {
        emitResumeStatus(ioInstance, userId, {
          resumeId: resume._id.toString(),
          type: "feedback_stream",
          chunk: textChunk,
        });
      }
    });

    return new Promise((resolve, reject) => {
      if (response.body) {
        response.body.on("end", () => resolve());
        response.body.on("error", (err: any) => reject(err));
      } else {
        resolve();
      }
    });
  } catch (error) {
    console.error(`[Worker] Error streaming feedback:`, error);
  }
};
