import {jest,test,expect,afterEach} from "@jest/globals";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import {googleChallenge,verifyGoogleChallenge} from "./authGoogle.js";
jest.mock("./types/errors.js",()=>jest.requireActual("./types/errors.ts"));
const saved={...process.env};
afterEach(()=>{process.env=saved;});
function app(){const a=express();a.use(express.json(),cookieParser());a.get("/api/user/google/challenge",googleChallenge);a.post("/api/user/google",(req,res)=>{verifyGoogleChallenge(req,req.body.nonce);res.json({ok:true});});a.use((err:any,_req:any,res:any,_next:any)=>{void _next;res.status(err.statusCode||500).json({message:err.message});});return a;}
test("Google challenge shares verifier audience and binds a secure, expiring cookie to nonce",async()=>{
 process.env={...saved,NODE_ENV:"development",JWT_SECRET:"isolated-challenge-test",GOOGLE_CLIENT_ID:"123-fixture.apps.googleusercontent.com"};
 const agent=request.agent(app());const challenge=await agent.get("/api/user/google/challenge");
 expect(challenge.status).toBe(200);expect(challenge.body.clientId).toBe(process.env.GOOGLE_CLIENT_ID);
 expect(challenge.headers["set-cookie"][0]).toContain("HttpOnly");expect(challenge.headers["set-cookie"][0]).toContain("SameSite=Lax");
 expect((await agent.post("/api/user/google").send({nonce:challenge.body.nonce})).status).toBe(200);
 expect((await agent.post("/api/user/google").send({nonce:"wrong"})).status).toBe(401);
 expect((await request(app()).post("/api/user/google").send({nonce:challenge.body.nonce})).status).toBe(401);
});
test("missing Google config returns safe recovery and production cookies are secure",async()=>{
 process.env={...saved,NODE_ENV:"production",JWT_SECRET:"isolated-challenge-test",GOOGLE_CLIENT_ID:""};
 expect((await request(app()).get("/api/user/google/challenge")).status).toBe(503);
 process.env.GOOGLE_CLIENT_ID="123-fixture.apps.googleusercontent.com";
 const result=await request(app()).get("/api/user/google/challenge");expect(result.headers["set-cookie"][0]).toContain("Secure");expect(result.headers["set-cookie"][0]).toContain("SameSite=None");
});
