import {jest,beforeEach,afterEach,test,expect} from "@jest/globals";
import express from "express";
import request from "supertest";
import {executeCode} from "./controllers/codeController.js";
import {sessionRepository} from "./models/Session.js";
import {evaluationService} from "./evaluation/service.js";
import {query} from "./config/db.js";
import {spawnSync} from "node:child_process";
import vm from "node:vm";
import {BINARY_SEARCH_TEST_CONTENT_HASH,parseBinarySearchResults,withBinarySearchTests} from "./codeExecution/specifications.js";
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
 jest.clearAllMocks();(sessionRepository.findByIdForUser as any).mockResolvedValue({status:"in-progress",scoringVersion:"rubric-v1",planId:"plan",questions:[{questionType:"coding",questionVersionId:"q1",planItemId:"item1",language:"javascript"}]});
 (query as any).mockResolvedValue({rows:[{inventory_class:"TRUSTED_BASELINE",content_hash:BINARY_SEARCH_TEST_CONTENT_HASH,category:"coding"}]});(evaluationService.recordExecution as any).mockResolvedValue(undefined);
 const results={cases:[{id:"match",expected:3,actual:3,passed:true},{id:"missing",expected:-1,actual:-1,passed:true},{id:"empty",expected:-1,actual:-1,passed:true}]};
 jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({statusCode:200,output:`__APTLYRA_TEST_RESULTS__${JSON.stringify(results)}`,cpuTime:"0.01",memory:"1"}),{status:200}));
});
afterEach(()=>{jest.restoreAllMocks();});
test("owned execution captures exact submitted artifact as runtime success",async()=>{
 const res=await request(app).post("/execute").send(body);expect(res.status).toBe(200);expect(res.body.run.code).toBe(0);expect(res.body.run.stdout).toContain("Tests passed: 3/3");expect(res.body.tests.cases).toHaveLength(3);expect(res.body.tests.passed).toBe(true);
 expect((globalThis.fetch as any).mock.calls[0][1].body).toContain("binarySearch(...test.input)");
 expect(evaluationService.recordExecution).toHaveBeenCalledWith(sessionId,"owner",0,body.code,"javascript","passed","Deterministic binary-search-v1 tests 3/3 passed.");
});
test("reported runtime failure cannot become passing evidence",async()=>{
 (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify({statusCode:200,output:'__APTLYRA_TEST_RESULTS__{"cases":[{"id":"match","expected":3,"actual":3,"passed":true},{"id":"missing","expected":-1,"actual":0,"passed":false},{"id":"empty","expected":-1,"actual":-1,"passed":true}]}'}),{status:200}));
 const res=await request(app).post("/execute").send(body);expect(res.status).toBe(200);expect(res.body.run.code).toBe(1);expect(res.body.tests.passed).toBe(false);
 expect(evaluationService.recordExecution).toHaveBeenLastCalledWith(sessionId,"owner",0,body.code,"javascript","failed","Deterministic binary-search-v1 tests 2/3 passed.");
});
test("cross-owner, submitted, withdrawn and unsupported-language execution is rejected before provider",async()=>{
 (sessionRepository.findByIdForUser as any).mockResolvedValueOnce(null);expect((await request(app).post("/execute").send(body)).status).toBe(404);
 expect((await request(app).post("/execute").send({...body,language:"ruby"})).status).toBe(400);
 (query as any).mockResolvedValueOnce({rows:[]});expect((await request(app).post("/execute").send(body)).status).toBe(409);
 (sessionRepository.findByIdForUser as any).mockResolvedValueOnce({status:"in-progress",questions:[{questionType:"coding",isSubmitted:true}]});expect((await request(app).post("/execute").send(body)).status).toBe(409);
 expect(globalThis.fetch).not.toHaveBeenCalled();expect(evaluationService.recordExecution).not.toHaveBeenCalled();
});
test("planned dynamic or unsupported questions cannot be run without a deterministic definition",async()=>{
 (query as any).mockResolvedValue({rows:[{inventory_class:"DYNAMIC_REVIEWED",content_hash:BINARY_SEARCH_TEST_CONTENT_HASH,category:"coding"}]});
 const res=await request(app).post("/execute").send(body);expect(res.status).toBe(409);expect(res.body.message).toContain("no approved deterministic test definition");
 expect(globalThis.fetch).not.toHaveBeenCalled();expect(evaluationService.recordExecution).not.toHaveBeenCalled();
});
test("provider timeout/raw failure records no objective result and returns safe detail",async()=>{
 (globalThis.fetch as any).mockRejectedValue(new Error("private provider credential detail"));const res=await request(app).post("/execute").send(body);expect(res.status).toBe(500);expect(JSON.stringify(res.body)).not.toContain("private provider");expect(evaluationService.recordExecution).not.toHaveBeenCalled();
});
test("legacy context-free execution retains its public contract without attaching evidence",async()=>{
 const res=await request(app).post("/execute").send({language:"javascript",code:body.code});expect(res.status).toBe(200);expect(res.body.run.code).toBe(0);expect(evaluationService.recordExecution).not.toHaveBeenCalled();
});

test("binary-search v1 runs match, missing and empty cases without provider-based grading",()=>{
 const javascript=withBinarySearchTests("function binarySearch(a,t){let l=0,h=a.length-1;while(l<=h){const m=Math.floor((l+h)/2);if(a[m]===t)return m;if(a[m]<t)l=m+1;else h=m-1;}return -1;}","javascript");
 let jsOutput="";vm.runInNewContext(javascript,{console:{log:(value:string)=>{jsOutput=value;}}});
 expect(parseBinarySearchResults(jsOutput).result).toMatchObject({passed:true,cases:[{id:"match",passed:true},{id:"missing",passed:true},{id:"empty",passed:true}]});
 const python=withBinarySearchTests("def binary_search(values, target):\n    low, high = 0, len(values) - 1\n    while low <= high:\n        middle = (low + high) // 2\n        if values[middle] == target: return middle\n        if values[middle] < target: low = middle + 1\n        else: high = middle - 1\n    return -1","python");
 const result=spawnSync("python3",["-c",python],{encoding:"utf8"});expect(result.status).toBe(0);expect(parseBinarySearchResults(result.stdout.trim()).result?.passed).toBe(true);
});

test("Python can execute a trusted coding question initially planned in JavaScript",async()=>{
 const res=await request(app).post("/execute").send({...body,language:"python",code:"def binary_search(a,t): return -1"});
 expect(res.status).toBe(200);
 expect(JSON.parse((globalThis.fetch as any).mock.calls[0][1].body).language).toBe("python3");
 expect(evaluationService.recordExecution).toHaveBeenCalledWith(sessionId,"owner",0,"def binary_search(a,t): return -1","python","passed",expect.any(String));
});
