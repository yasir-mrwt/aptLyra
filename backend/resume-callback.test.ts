import { jest, beforeEach, test, expect } from "@jest/globals";
import express from "express";
import request from "supertest";
import { processResumeWebhook } from "./controllers/webhookController.js";
import { requireInternalKey } from "./middleware/internalAuth.js";
import { resumeRepository } from "./models/Resume.js";
import { addResumeAnalyzeJob } from "./services/queue/queueService.js";
jest.mock("./models/Resume.js", () => ({ resumeRepository: { findById: jest.fn(), save: jest.fn() } }));
jest.mock("./services/queue/queueService.js", () => ({ addResumeAnalyzeJob: jest.fn() }));
jest.mock("./utils/logger.js", () => ({ __esModule: true, default: { info: jest.fn() } }));
jest.mock("./services/socketService.js", () => ({ emitResumeStatus: jest.fn() }));
const app = express(); app.use(express.json());
app.post("/api/resume/webhook/process-resume/:id", requireInternalKey, processResumeWebhook);
const repo = jest.mocked(resumeRepository);
beforeEach(() => {
  jest.clearAllMocks(); process.env.INTERNAL_API_KEY = "fixture-key";
  repo.findById.mockResolvedValue({ _id: "fixture-id", user: "owner", status: "processing" } as any);
});
test("unauthorized callback cannot read or mutate the resume", async () => {
  const response = await request(app).post("/api/resume/webhook/process-resume/fixture-id").send({ success: true });
  expect(response.status).toBe(401); expect(repo.findById).not.toHaveBeenCalled(); expect(repo.save).not.toHaveBeenCalled();
});
test("authenticated successful callback persists parsing and enqueues analysis", async () => {
  const response = await request(app).post("/api/resume/webhook/process-resume/fixture-id").set("X-API-Key", "fixture-key").send({ success: true, data: { raw_text: "Fixture resume", parsed_profile: { name: "Fixture" } } });
  expect(response.status).toBe(200);
  expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: "parsed", parsedData: expect.objectContaining({ rawText: "Fixture resume" }) }));
  expect(addResumeAnalyzeJob).toHaveBeenCalledWith("fixture-id");
});
test("malformed success is rejected and failure never marks parsed", async () => {
  expect((await request(app).post("/api/resume/webhook/process-resume/fixture-id").set("X-API-Key", "fixture-key").send({ success: true, data: {} })).status).toBe(400);
  expect(repo.save).not.toHaveBeenCalled();
  expect((await request(app).post("/api/resume/webhook/process-resume/fixture-id").set("X-API-Key", "fixture-key").send({ success: false, error: "Fixture failure" })).status).toBe(200);
  expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  expect(addResumeAnalyzeJob).not.toHaveBeenCalled();
});
