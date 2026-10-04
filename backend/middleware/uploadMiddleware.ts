/**
 * @file src/middleware/uploadMiddleware.ts
 * @description Multer configuration for audio file uploads (transcription input)
 */
import multer, { FileFilterCallback } from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Request } from "express";

const storage = multer.diskStorage({
  destination: function (req: any, file: any, cb: any) {
    fs.mkdir("uploads", { recursive: true }, error => cb(error, "uploads/"));
  },
  filename: function (req: any, file: any, cb: any) {
    const baseMime = file.mimetype.split(";")[0].trim();
    const extension: Record<string, string> = { "audio/webm": ".webm", "audio/wav": ".wav", "audio/mp3": ".mp3", "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/mp4": ".m4a" };
    const filename = `${randomUUID()}${extension[baseMime] || ".webm"}`;
    cb(null, filename);
  },
});

const fileFilter = (req: Request, file: any, cb: FileFilterCallback): void => {
  const allowedMimeTypes = [
    "audio/webm",
    "audio/wav",
    "audio/mp3",
    "audio/mpeg",
    "audio/ogg",
    "audio/mp4",
  ];

  // Some browsers append codecs to the mimetype, e.g., 'audio/webm;codecs=opus'
  const baseMimeType = file.mimetype.split(";")[0].trim();

  if (allowedMimeTypes.includes(baseMimeType)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only standardized audio formats are allowed."));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 10 }, // 10MB
});

export const uploadSingleAudio = upload.single("audio");
