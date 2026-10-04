/**
 * @file src/middleware/uploadMiddleware.ts
 * @description Multer configuration for audio file uploads (transcription input)
 */
import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";

const storage = multer.diskStorage({
  destination: function (req: any, file: any, cb: any) {
    cb(null, "uploads/");
  },
  filename: function (req: any, file: any, cb: any) {
    const ext = path.extname(file.originalname) || ".webm";
    const sessionId = req.params.sessionId || "unknown";
    const filename = `${sessionId}-${Date.now()}${ext}`;
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
