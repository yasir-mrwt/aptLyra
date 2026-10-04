/**
 * @file src/middleware/validationMiddleware.ts
 * @description Request validation middleware using express-validator
 */
import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";

// Middleware to check for validation errors
export const validateResult = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map((e) => e.msg).join(", "));
  }
  next();
};

export const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 50 })
    .withMessage("Name must be less than 50 characters"),
  body("email").trim().isEmail().withMessage("Please provide a valid email"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
];

export const loginValidation = [
  body("email").trim().isEmail().withMessage("Please provide a valid email"),
  body("password").notEmpty().withMessage("Password is required"),
];

export const profileUpdateValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Name must be less than 50 characters"),
  body("email").optional().trim().isEmail().withMessage("Please provide a valid email"),
  body("password")
    .optional()
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("preferredRole").optional().trim(),
];

export const sessionCreationValidation = [
  body("role")
    .trim()
    .notEmpty()
    .withMessage("Role is required")
    .isLength({ max: 50 })
    .withMessage("Role must be less than 50 characters"),
  body("level").trim().notEmpty().withMessage("Level is required").isLength({ max: 50 }),
  body("interviewType").isIn(["oral-only", "coding-mix", "company-specific"]).withMessage("Invalid interview type"),
  body("company").optional().isString().withMessage("Company must be a string"),
  body("companyTrack").optional().isString().withMessage("Company track must be a string"),
  body("count").isInt({ min: 1, max: 20 }).withMessage("Count must be an integer between 1 and 20"),
];
