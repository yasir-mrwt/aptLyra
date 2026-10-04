/**
 * @file middleware/errorMiddleware.ts
 * @description Error handling middleware with TypeScript support
 */

import { Request, Response, NextFunction } from "express";
import { AppError, ErrorResponse } from "../types/errors.js";
import { generateRequestId } from "../utils/requestId.js";

/**
 * Middleware to handle 404 Not Found errors.
 * Captures the requested URL and forwards a 404 Error to the global handler.
 */
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Global Error Handler middleware.
 * Formats errors and sends JSON responses. Includes stack traces only in development.
 * @param {Error} err - Error object.
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next function.
 */
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If headers have already been sent, delegate to the default Express error handler
  // to avoid "Headers already sent" errors.
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = req.headers["x-request-id"] as string || generateRequestId();
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  let errorResponse: ErrorResponse;

  if (err instanceof AppError) {
    errorResponse = {
      code: err.code,
      message: err.message,
      details: err.details,
      requestId,
      timestamp: new Date(),
    };
    res.status(err.statusCode);
  } else {
    errorResponse = {
      code: "INTERNAL_ERROR",
      message: err.message || "Internal Server Error",
      requestId,
      timestamp: new Date(),
    };
    res.status(statusCode);
  }

  // Add stack trace only in development
  if (process.env.NODE_ENV === "development") {
    console.error("Error Stack:", err.stack);
  }

  res.json({
    success: false,
    error: errorResponse,
  });
};
