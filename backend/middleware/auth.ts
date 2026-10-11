/**
 * @file middleware/auth.ts
 * @description Authentication middleware with TypeScript support
 */

import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import { userRepository } from "../models/User.js";
import { AppError } from "../types/errors.js";
import { AuthenticatedRequest } from "../types/express.js";

/**
 * Middleware to protect routes by verifying standard HttpOnly JWT cookies.
 * Attaches the authenticated user to the request object (req.user).
 * @param {AuthRequest} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function.
 * @throws {AppError} 401 If token is missing, expired, or invalid.
 */
export const protect = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies.jwt;

    if (!token) throw new AppError("UNAUTHORIZED", "Not authorized, no token", {}, 401);
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new AppError("INTERNAL_ERROR", "Authentication is temporarily unavailable", {}, 503);
    let userId: string;
    try {
      const decoded = jwt.verify(token, jwtSecret);
      if (typeof decoded === "string" || typeof decoded.id !== "string") throw new Error("Invalid token payload");
      userId = decoded.id;
    } catch {
      throw new AppError("UNAUTHORIZED", "Not authorized, token failed", {}, 401);
    }
    let user;
    try { user = await userRepository.findById(userId); }
    catch {
      // A database outage does not invalidate a valid login or require rotation.
      throw new AppError("INTERNAL_ERROR", "Account verification is temporarily unavailable. Please retry.", {}, 503);
    }
    if (!user) throw new AppError("UNAUTHORIZED", "Not authorized, no user found", {}, 401);
    req.user = userRepository.toSafeObject(user);
    next();
  }
);
