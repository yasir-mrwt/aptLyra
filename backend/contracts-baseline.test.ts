import { jest, test, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";
import { requireInternalKey } from "./middleware/internalAuth.js";
import { sessionCreationValidation, validateResult } from "./middleware/validationMiddleware.js";
import { createSession } from "./controllers/sessionController.js";
import { sessionService } from "./services/sessionService.js";
jest.mock("./services/sessionService.js", () => ({ sessionService: { createInterviewSession: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ _id: "new-session" }) } }));
jest.mock("./services/aiService.js", () => ({ aiService: {} }));
const app = express();
app.use(express.json());
app.post("/sessions", (req: any, _res: express.Response, next: express.NextFunction) => { req.user = { id: "owner" }; next(); }, sessionCreationValidation, validateResult, createSession);
app.post("/callback", requireInternalKey, (_req, res) => res.json({ accepted: true }));
app.use((error: Error, _req: any, res: any, _next: any) => { void _next; res.status(res.statusCode >= 400 ? res.statusCode : 500).json({ message: error.message }); });
const payload = { role: "Backend", level: "Junior", interviewType: "company-specific", count: 2, company: "Acme", companyTrack: "Platform" };
beforeEach(() => { jest.clearAllMocks(); });
test("creation validation and controller retain company/track", async () => {
  expect((await request(app).post("/sessions").send(payload)).status).toBe(201);
  expect(sessionService.createInterviewSession).toHaveBeenCalledWith("owner", "Backend", "Junior", "company-specific", 2, "Acme", "Platform", undefined, undefined);
});
test.each([{ company: "" }, { companyTrack: " " }, { company: 4 }, { count: 21 }, { interviewType: "unknown" }])("invalid setup is rejected: %j", async invalid => {
  expect((await request(app).post("/sessions").send({ ...payload, ...invalid })).status).toBe(400);
  expect(sessionService.createInterviewSession).not.toHaveBeenCalled();
});
test("general interviews do not require company/track", async () => {
  expect((await request(app).post("/sessions").send({ role: "Backend", level: "Junior", interviewType: "oral-only", count: 2 })).status).toBe(201);
});
test("callback key rejects missing/wrong key and accepts the configured key", async () => {
  process.env.INTERNAL_API_KEY = "fixture-internal-key";
  expect((await request(app).post("/callback")).status).toBe(401);
  expect((await request(app).post("/callback").set("X-API-Key", "wrong")).status).toBe(401);
  expect((await request(app).post("/callback").set("X-API-Key", "fixture-internal-key")).status).toBe(200);
  delete process.env.INTERNAL_API_KEY;
  expect((await request(app).post("/callback")).status).toBe(503);
});
