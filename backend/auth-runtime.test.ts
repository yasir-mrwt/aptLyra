import {jest,test,expect,afterEach} from "@jest/globals";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import {protect} from "./middleware/auth.js";
import {userRepository} from "./models/User.js";
jest.mock("./models/User.js",()=>({userRepository:{findById:jest.fn(),toSafeObject:jest.fn()}}));
jest.mock("./types/errors.js",()=>jest.requireActual("./types/errors.ts"));
const app=express();
app.use((req:any,_res,next)=>{req.cookies={jwt:req.get("x-test-token")};next();});
app.get("/owned",protect,(_req,res)=>res.json({ok:true}));
app.use((error:any,_req:any,res:any,_next:any)=>{void _next;res.status(error.statusCode||500).json({message:error.message});});
afterEach(()=>{jest.resetAllMocks();delete process.env.JWT_SECRET;});
test("database lookup failure preserves login semantics with 503, never a false 401",async()=>{
 process.env.JWT_SECRET="isolated-auth-fixture";
 jest.mocked(userRepository.findById).mockRejectedValue(new Error("private database connection details"));
 const response=await request(app).get("/owned").set("x-test-token",jwt.sign({id:"owned"},process.env.JWT_SECRET));
 expect(response.status).toBe(503);expect(response.body.message).toContain("temporarily unavailable");expect(JSON.stringify(response.body)).not.toContain("private database");
});
test("invalid credentials remain 401 without querying the database",async()=>{
 process.env.JWT_SECRET="isolated-auth-fixture";
 expect((await request(app).get("/owned").set("x-test-token","invalid")).status).toBe(401);
 expect(userRepository.findById).not.toHaveBeenCalled();
});
