jest.mock("./models/Session.js",()=>({sessionRepository:{findByIdForUser:jest.fn()}}));
import { jest, beforeEach, test, expect } from "@jest/globals";
import express from "express";
import request from "supertest";
import { speakQuestion, submitAnswer } from "./controllers/sessionController.js";
import { sessionService } from "./services/sessionService.js";
import { aiService } from "./services/aiService.js";
jest.mock("./services/sessionService.js", () => ({
  SessionStateError: class extends Error {},
  sessionService: { getSessionDetails: jest.fn<(...args: any[]) => Promise<any>>(), submitSessionAnswer: jest.fn<(...args: any[]) => Promise<any>>() }
}));
jest.mock("./services/aiService.js", () => ({ aiService: { synthesizeSpeech: jest.fn<(...args: any[]) => Promise<Buffer>>() } }));
const app = express(); app.use(express.json());
app.use((req: any, _res, next) => { req.user = { id: "owner" }; next(); });
app.post("/:sessionId/speak", speakQuestion); app.post("/:sessionId/submit-answer", submitAnswer);
beforeEach(() => {
  jest.clearAllMocks();
  (sessionService.getSessionDetails as any).mockResolvedValue({ status: "in-progress", questions: [{ questionText: "Reviewed question" }] });
  (sessionService.submitSessionAnswer as any).mockResolvedValue(undefined);
  (aiService.synthesizeSpeech as any).mockResolvedValue(Buffer.from("WAV fixture"));
});
test("server voice success preserves the audio path and server-selected text", async () => {
  const response = await request(app).post("/owned/speak").send({ questionIndex: 0, text: "ignored" });
  expect(response.status).toBe(200); expect(response.headers["content-type"]).toContain("audio/wav");
  expect(sessionService.getSessionDetails).toHaveBeenCalledWith("owned", "owner");
  expect(aiService.synthesizeSpeech).toHaveBeenCalledWith("Reviewed question");
});
test("provider failure returns intentional unavailable without raw detail", async () => {
  (aiService.synthesizeSpeech as any).mockRejectedValue(new Error("private provider body"));
  const response = await request(app).post("/owned/speak").send({ questionIndex: 0 });
  expect(response.status).toBe(503); expect(response.body).toMatchObject({ code: "tts_unavailable", retryable: false });
  expect(response.headers["cache-control"]).toBe("no-store"); expect(JSON.stringify(response.body)).not.toContain("private provider body");
});
test("invalid index, ownership, withdrawn and inactive guards never call TTS", async () => {
  expect((await request(app).post("/owned/speak").send({ questionIndex: "0junk" })).status).toBe(400);
  (sessionService.getSessionDetails as any).mockRejectedValueOnce(new Error("Session not found"));
  expect((await request(app).post("/other/speak").send({ questionIndex: 0 })).status).toBe(404);
  (sessionService.getSessionDetails as any).mockResolvedValueOnce({ status: "completed", questions: [] });
  expect((await request(app).post("/owned/speak").send({ questionIndex: 0 })).status).toBe(409);
  (sessionService.getSessionDetails as any).mockResolvedValueOnce({ status: "in-progress", questions: [{ evidenceUnavailable: true }] });
  expect((await request(app).post("/owned/speak").send({ questionIndex: 0 })).status).toBe(409);
  expect(aiService.synthesizeSpeech).not.toHaveBeenCalled();
});
test("typed answer is forwarded through the existing owned submission service", async () => {
  expect((await request(app).post("/owned/submit-answer").send({ questionIndex: "1", answerText: "Candidate answer" })).status).toBe(200);
  expect(sessionService.submitSessionAnswer).toHaveBeenCalledWith("owned", "owner", "1", null, null, null, null, undefined, "Candidate answer");
});

test('transcription returns a reviewable draft without accepting an answer and deletes temporary audio',async()=>{
 const {transcribeAnswer}=await import('./controllers/sessionController.js');
 const {sessionRepository}=await import('./models/Session.js');
 const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const file=path.join(os.tmpdir(),`aptlyra-transcript-${Date.now()}.webm`);await fs.writeFile(file,'fixture');
 (sessionRepository.findByIdForUser as any).mockResolvedValue({status:'in-progress',questions:[{isSubmitted:false}]});
 (aiService as any).transcribeAudio=jest.fn<(...args:any[])=>Promise<string>>().mockResolvedValue('Editable transcript');
 const local=express();local.use(express.json());local.use((req:any,_res,next)=>{req.user={id:'owner'};req.file={path:file,mimetype:'audio/webm'};next();});local.post('/:sessionId/transcribe',transcribeAnswer);
 const response=await request(local).post('/owned/transcribe').send({questionIndex:0});
 expect(response.status).toBe(200);expect(response.body).toEqual({text:'Editable transcript',requiresConfirmation:true});
 expect(sessionRepository.findByIdForUser).toHaveBeenCalledWith('owned','owner');expect(sessionService.submitSessionAnswer).not.toHaveBeenCalled();
 await expect(fs.stat(file)).rejects.toThrow();
 (sessionRepository.findByIdForUser as any).mockResolvedValue(null);
 expect((await request(local).post('/other/transcribe').send({questionIndex:0})).status).toBe(404);
 expect((aiService as any).transcribeAudio).toHaveBeenCalledTimes(1);
});
