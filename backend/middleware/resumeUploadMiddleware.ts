/**
 * @file middleware/resumeUploadMiddleware.ts
 * @description Multer configuration for resume file uploads
 */

import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";

import { AuthenticatedRequest } from "../types/express.js";

const storage = multer.diskStorage({
  destination: function (req: any, file: any, cb: any) {
    cb(null, "uploads/resumes/");
  },
  filename: function (req: AuthenticatedRequest, file: any, cb: any) {
    const ext = path.extname(file.originalname);
    const userId = req.user ? req.user._id.toString() : "unknown";
    const filename = `${userId}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req: Request, file: any, cb: FileFilterCallback): void => {
  const allowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, DOCX, and TXT files are allowed."));
  }
};

const uploadResume = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 10 }, // 10MB limit
});

export const uploadSingleResume = uploadResume.single("resume");
