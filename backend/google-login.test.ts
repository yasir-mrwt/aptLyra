import {jest,test,expect,beforeEach} from "@jest/globals";
import express from "express";
import request from "supertest";
import {OAuth2Client} from "google-auth-library";
import {googleLogin} from "./controllers/userController.js";
import {userRepository} from "./models/User.js";
import {query} from "./config/db.js";
jest.mock("./authGoogle.js",()=>({verifyGoogleChallenge:jest.fn(),googleCookieOptions:()=>({path:"/api/user/google"})}));
jest.mock("./models/User.js",()=>({userRepository:{findByGoogleId:jest.fn(),findByEmail:jest.fn(),create:jest.fn()}}));
jest.mock("./models/RefreshToken.js",()=>({refreshTokenRepository:{create:jest.fn()}}));
jest.mock("./config/db.js",()=>({query:jest.fn(),withDatabaseLock:async(_key:string,fn:()=>unknown)=>fn()}));
jest.mock("./config/redisConfig.js",()=>({__esModule:true,default:{}}));
jest.mock("./config/cloudinary.js",()=>({__esModule:true,default:{}}));
jest.mock("./services/emailService.js",()=>({emailService:{}}));
const app=express();app.use(express.json());app.post('/google',googleLogin);app.use((err:any,_req:any,res:any,_next:any)=>{void _next;res.status(res.statusCode===200?500:res.statusCode).json({message:err.message});});
const user={_id:'owned',name:'Fixture',email:'fixture@gmail.com',preferredRole:'Software Engineer',appRole:'owner'};
let verify:any;
beforeEach(()=>{jest.restoreAllMocks();jest.clearAllMocks();process.env.GOOGLE_CLIENT_ID='123-fixture.apps.googleusercontent.com';process.env.JWT_SECRET='isolated-google-test';process.env.NODE_ENV='development';verify=jest.spyOn(OAuth2Client.prototype,'verifyIdToken') as any;verify.mockResolvedValue({getPayload:()=>({email_verified:true,email:user.email,sub:'google-sub',nonce:'nonce'})} as any);});
test('returning verified Google identity preserves account and never creates duplicate or changes role',async()=>{
 (userRepository.findByGoogleId as any).mockResolvedValue(user);
 const result=await request(app).post('/google').send({token:'fixture'});expect(result.status).toBe(200);expect(result.body._id).toBe('owned');expect(userRepository.create).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect((result.headers['set-cookie'] as unknown as string[]).find((cookie:string)=>cookie.startsWith('jwt='))).toContain('HttpOnly');
});
test('mismatched Google identity cannot take over an existing email account',async()=>{
 (userRepository.findByGoogleId as any).mockResolvedValue(null);(userRepository.findByEmail as any).mockResolvedValue({...user,googleId:'other-sub'});
 expect((await request(app).post('/google').send({token:'fixture'})).status).toBe(409);expect(query).not.toHaveBeenCalled();
});
test('Google-managed verified email links only identity fields; third-party email needs existing sign-in',async()=>{
 (userRepository.findByGoogleId as any).mockResolvedValue(null);(userRepository.findByEmail as any).mockResolvedValue(user);(query as any).mockResolvedValue({rows:[]});
 expect((await request(app).post('/google').send({token:'fixture'})).status).toBe(200);expect((query as any).mock.calls[0][0]).not.toContain('app_role');
 verify.mockResolvedValueOnce({getPayload:()=>({email_verified:true,email:'fixture@example.invalid',sub:'new-sub'})});
 expect((await request(app).post('/google').send({token:'fixture'})).status).toBe(409);
});
test('expired/invalid provider credential is a safe 401; no raw Google diagnostics',async()=>{
 verify.mockRejectedValue(new Error('private provider response'));
 const result=await request(app).post('/google').send({token:'fixture'});expect(result.status).toBe(401);expect(result.text).not.toContain('private provider');expect(userRepository.findByGoogleId).not.toHaveBeenCalled();
});
