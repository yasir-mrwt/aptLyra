import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type {Request,Response} from "express";
import {AppError} from "./types/errors.js";
export const googleCookieOptions=()=>({httpOnly:true,secure:process.env.NODE_ENV!=="development",sameSite:(process.env.NODE_ENV!=="development"?"none":"lax") as "none"|"lax",path:"/api/user/google"});
export function googleChallenge(req:Request,res:Response) {
  const clientId=process.env.GOOGLE_CLIENT_ID?.trim();
  if(!clientId || !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)||!process.env.JWT_SECRET)
    throw new AppError("INTERNAL_ERROR","Google sign-in is not configured. Use email sign-in or contact the operator.",undefined,503);
  // Keep one still-valid browser-bound configuration across login/join remounts.
  // Successful login consumes the cookie; expired/invalid challenges are replaced.
  try {
    const existing=jwt.verify(req.cookies?.google_challenge,process.env.JWT_SECRET) as jwt.JwtPayload;
    if(existing.purpose==="google-login" && typeof existing.nonce==="string" && typeof existing.exp==="number" && existing.exp*1000>Date.now()+30000){
      res.setHeader("Cache-Control","no-store");res.json({clientId,nonce:existing.nonce});return;
    }
  } catch { /* Missing or expired challenge: issue a new signed nonce. */ }
  const nonce=crypto.randomBytes(32).toString("hex");
  res.setHeader("Cache-Control","no-store");
  res.cookie("google_challenge",jwt.sign({nonce,purpose:"google-login"},process.env.JWT_SECRET,{expiresIn:"10m"}),{...googleCookieOptions(),maxAge:600000});
  res.json({clientId,nonce});
}
export function verifyGoogleChallenge(req:Request,nonce:unknown) {
  try {
    const data=jwt.verify(req.cookies?.google_challenge,process.env.JWT_SECRET!) as jwt.JwtPayload;
    if(data.purpose!=="google-login" || typeof nonce!=="string" || nonce!==data.nonce)throw Error();
  } catch {throw new AppError("VALIDATION_ERROR","Google sign-in expired or belongs to another browser. Reload the sign-in page and try again.",undefined,401);}
}
