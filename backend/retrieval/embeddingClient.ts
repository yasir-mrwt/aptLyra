import { MODEL, RetrievalFailure, validateBatch, type Embedder } from "./contracts.js";

/** Existing backend↔FastAPI shared-secret boundary; no source-selected destinations/models. */
export class EmbeddingClient implements Embedder {
  async embed(texts: string[], mode: "documents" | "query") {
    if (!texts.length || texts.length>16 || (mode==="query" && texts.length!==1)
      || texts.some(t=>typeof t!=="string" || !t.trim() || t.length>4000)) throw new RetrievalFailure("invalid_input");
    const base = process.env.AI_SERVICE_URL || "http://localhost:8000";
    const key = process.env.INTERNAL_API_KEY;
    if (!key) throw new RetrievalFailure("model_unavailable");
    try {
      const response = await fetch(new URL("/internal/embeddings",base), {method:"POST", redirect:"error",
        headers:{"Content-Type":"application/json","X-API-Key":key},body:JSON.stringify({mode,texts}),
        signal:AbortSignal.timeout(12000)});
      if (!response.ok) {
        await response.body?.cancel();
        throw new RetrievalFailure(response.status===504 ? "model_timeout" : "model_unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new RetrievalFailure("invalid_model_output");
      const chunks: Uint8Array[]=[]; let length=0;
      try {
        for (;;) {
          const {done,value}=await reader.read(); if (done) break;
          length+=value.length; if(length>262144) throw new RetrievalFailure("invalid_model_output");
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      return validateBatch(JSON.parse(Buffer.concat(chunks).toString("utf8")),texts.length);
    } catch(error) {
      if(error instanceof RetrievalFailure) throw error;
      throw new RetrievalFailure("model_unavailable");
    }
  }
}
export { MODEL };
