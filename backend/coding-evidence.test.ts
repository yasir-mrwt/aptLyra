import {jest,beforeEach,afterEach,test,expect} from "@jest/globals";
import express from "express";
import request from "supertest";
import {executeCode} from "./controllers/codeController.js";
import {sessionRepository} from "./models/Session.js";
import {evaluationService} from "./evaluation/service.js";
import {query} from "./config/db.js";
// The baseline includes a compatibility errors.js; exercise the typed AppError.
jest.mock("./types/errors.js",()=>jest.requireActual("./types/errors.ts"));
jest.mock("./models/Session.js",()=>({sessionRepository:{findByIdForUser:jest.fn<(...a:any[])=>Promise<any>>()}}));
jest.mock("./evaluation/service.js",()=>({evaluationService:{recordExecution:jest.fn<(...a:any[])=>Promise<void>>()}}));
jest.mock("./config/db.js",()=>({query:jest.fn<(...a:any[])=>Promise<any>>() }));
jest.mock("./utils/logger.js",()=>({__esModule:true,default:{error:jest.fn()}}));
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.user={id:"owner"};next();});app.post("/execute",executeCode);
app.use((err:any,_req:any,res:any,next:any)=>{void next;res.status(err.statusCode || 500).json({message:err.message});});
const sessionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const body={sessionId,questionIndex:0,language:"javascript",code:"console.log(1)"};
beforeEach(()=>{
 jest.clearAllMocks();(sessionRepository.findByIdForUser as any).mockResolvedValue({status:"in-progress",scoringVersion:"rubric-v1",planId:"plan",questions:[{questionType:"coding",questionVersionId:"q1",language:"javascript"}]});
 (query as any).mockResolvedValue({rows:[{entity_id:"q1"}]});(evaluationService.recordExecution as any).mockResolvedValue(undefined);
 jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({statusCode:200,output:"1",cpuTime:"0.01",memory:"1"}),{status:200}));
});
afterEach(()=>{jest.restoreAllMocks();});
test("owned execution captures exact submitted artifact as runtime success",async()=>{
 const res=await request(app).post("/execute").send(body);expect(res.status).toBe(200);expect(res.body.run.stdout).toBe("1");expect(evaluationService.recordExecution).toHaveBeenCalledWith(sessionId,"owner",0,body.code,"javascript","passed");
});
test("reported runtime failure cannot become passing evidence",async()=>{
 (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify({statusCode:400,output:"compile failure"}),{status:200}));
 expect((await request(app).post("/execute").send(body)).status).toBe(200);expect(evaluationService.recordExecution).toHaveBeenLastCalledWith(sessionId,"owner",0,body.code,"javascript","failed");
});
test("cross-owner, submitted, withdrawn and mismatched-language execution is rejected before provider",async()=>{
 (sessionRepository.findByIdForUser as any).mockResolvedValueOnce(null);expect((await request(app).post("/execute").send(body)).status).toBe(404);
 expect((await request(app).post("/execute").send({...body,language:"python"})).status).toBe(409);
 (query as any).mockResolvedValueOnce({rows:[]});expect((await request(app).post("/execute").send(body)).status).toBe(409);
 (sessionRepository.findByIdForUser as any).mockResolvedValueOnce({status:"in-progress",questions:[{questionType:"coding",isSubmitted:true}]});expect((await request(app).post("/execute").send(body)).status).toBe(409);
 expect(globalThis.fetch).not.toHaveBeenCalled();expect(evaluationService.recordExecution).not.toHaveBeenCalled();
});
test("provider timeout/raw failure records no objective result and returns safe detail",async()=>{
 (globalThis.fetch as any).mockRejectedValue(new Error("private provider credential detail"));const res=await request(app).post("/execute").send(body);expect(res.status).toBe(500);expect(JSON.stringify(res.body)).not.toContain("private provider");expect(evaluationService.recordExecution).not.toHaveBeenCalled();
});
test("legacy context-free execution retains its public contract without attaching evidence",async()=>{
 const res=await request(app).post("/execute").send({language:"javascript",code:body.code});expect(res.status).toBe(200);expect(res.body.run.code).toBe(0);expect(evaluationService.recordExecution).not.toHaveBeenCalled();
});
