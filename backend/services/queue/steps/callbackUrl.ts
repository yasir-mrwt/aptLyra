/** The sole callback destination is an operator-configured backend origin. */
export function getResumeCallbackUrl(resumeId: string): string {
  const base = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`;
  const url = new URL(base);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(resumeId) ||
      !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (["production", "staging"].includes(process.env.NODE_ENV || "") && url.protocol !== "https:")) {
    throw new Error("Invalid trusted backend callback configuration");
  }
  return `${url.origin}/api/resume/webhook/process-resume/${resumeId}`;
}
