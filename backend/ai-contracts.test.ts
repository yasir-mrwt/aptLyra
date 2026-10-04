import { jest, test, expect, beforeEach } from "@jest/globals";
import fetch from "node-fetch";
import { aiService } from "./services/aiService.js";
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
