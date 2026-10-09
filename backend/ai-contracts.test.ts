import { jest, test, expect, beforeEach } from "@jest/globals";
import fetch from "node-fetch";
import { aiService, AIServiceError } from "./services/aiService.js";
jest.mock("node-fetch", () => ({ __esModule: true, default: jest.fn() }));
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
function fixture(data: unknown) { mockedFetch.mockResolvedValue({ ok: true, json: async () => data } as any); }
beforeEach(() => { mockedFetch.mockReset(); });
test("Node sends company fields to the Python schema", async () => {
  fixture({ questions: [{ question: "Q", ideal_answer: "A", question_type: "oral" }] });
  await aiService.generateQuestions({ role: "Backend", level: "Junior", interviewType: "company-specific", count: 1, company: "Acme", companyTrack: "Platform" });
  expect(JSON.parse((mockedFetch.mock.calls[0][1] as any).body)).toMatchObject({ company: "Acme", company_track: "Platform" });
});
test.each([{}, { questions: [] }, { questions: [{ question: "Q", ideal_answer: "A", question_type: "invalid" }] }])("bad generation rejects %j", async data => {
  fixture(data);
  await expect(aiService.generateQuestions({ role: "Backend", level: "Junior", interviewType: "oral-only", count: 1 })).rejects.toThrow("Invalid question");
});
test("flat transcription contract", async () => {
  fixture({ transcription: "Candidate answer" });
  expect(await aiService.transcribeAudio(Buffer.from("audio"))).toBe("Candidate answer");
  fixture({ transcription: { text: "old nested shape" } });
  await expect(aiService.transcribeAudio(Buffer.from("audio"))).rejects.toThrow("No valid transcript");
});
test.each([{ transcript: "", metrics: null, metrics_status: "unavailable" }, { transcript: "answer", metrics: {}, metrics_status: "bad" }, { transcript: "answer", metrics: {}, metrics_status: "available" }])("invalid speech rejects %j", async data => {
  fixture(data);
  await expect(aiService.analyzeSpeech(Buffer.from("audio"))).rejects.toThrow();
});
test("invalid evaluation is never saved as default zero scores", async () => {
  fixture({ technical_score: 101, confidence_score: 70, ai_feedback: "feedback", ideal_answer: "answer" });
  await expect(aiService.evaluateAnswer({ question: "Q", question_type: "oral", user_answer: "Answer", user_code: "", selected_language: "js", role: "Backend", level: "Junior", interview_type: "oral-only" })).rejects.toThrow("Invalid evaluation");
});
test("active speech path preserves MP4 audio metadata", async () => {
  fixture({ transcript: "Answer", metrics: null, metrics_status: "unavailable" });
  await aiService.analyzeSpeech(Buffer.from("audio"), undefined, "fixture.m4a");
  const body = mockedFetch.mock.calls[0][1]?.body as unknown as { getBuffer: () => Buffer };
  expect(body.getBuffer().toString()).toContain('filename="audio.m4a"');
  expect(body.getBuffer().toString()).toContain("Content-Type: audio/mp4");
});

test("malformed follow-up is rejected instead of appending an empty question", async () => {
  fixture({ question_type: "oral" });
  await expect(aiService.generateFollowUp({ question: "Q", userAnswer: "A", aiFeedback: "F", role: "Backend", level: "Junior" })).rejects.toThrow("Invalid follow-up");
});

test("TTS provider failure is categorized once without leaking the upstream body", async () => {
  mockedFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: { code: "tts_terms_required", message: "private provider body" } }) } as any);
  await expect(aiService.synthesizeSpeech("Question")).rejects.toMatchObject({ code: "tts_terms_required", upstreamStatus: 503, message: "AI operation unavailable. Please retry." });
  expect(mockedFetch).toHaveBeenCalledTimes(1);
});
test("TTS accepts WAV bytes and rejects malformed successful responses", async () => {
  const wav = Buffer.alloc(44); wav.write("RIFF"); wav.write("WAVE", 8);
  mockedFetch.mockResolvedValue({ ok: true, arrayBuffer: async () => wav } as any);
  expect(await aiService.synthesizeSpeech("Question")).toEqual(wav);
  mockedFetch.mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("private provider body") } as any);
  await expect(aiService.synthesizeSpeech("Question")).rejects.toBeInstanceOf(AIServiceError);
});
test("non-retryable model error never exposes upstream response text", async () => {
  mockedFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: "private provider body" }) } as any);
  await expect(aiService.evaluateAnswer({ question: "Q", question_type: "oral", user_answer: "A", user_code: "", selected_language: "js", role: "Backend", level: "Junior", interview_type: "oral-only" })).rejects.toMatchObject({ code: "provider_unavailable", message: "AI operation unavailable. Please retry." });
  expect(mockedFetch).toHaveBeenCalledTimes(1);
});
test("editorial validation codes and request ID survive the AI-service boundary", async () => {
  mockedFetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({ detail: {
    code: "editorial_schema_validation_failed", category: "schema_validation", message: "private validation body",
  } }) } as any);
  await expect(aiService.reviewEditorialCandidate({ question: "Explain binary search.", allowedCompetencies: ["dsa.search-sort"],
    allowedCategories: ["conceptual-oral"], evidenceText: null, similarQuestions: [] }, "request-review-123"))
    .rejects.toMatchObject({ code: "editorial_schema_validation_failed", category: "schema_validation", upstreamStatus: 502,
      message: "AI operation unavailable. Please retry." });
  expect(mockedFetch.mock.calls[0][1]?.headers).toMatchObject({ "X-Request-ID": "request-review-123" });
});
