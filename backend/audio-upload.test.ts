import { test, expect } from "@jest/globals";
import express from "express";
import request from "supertest";
import fs from "node:fs/promises";
import { uploadSingleAudio } from "./middleware/uploadMiddleware.js";
const app = express();
app.post("/audio/:sessionId", uploadSingleAudio, async (req, res) => {
  const file = req.file;
  if (!file) { res.status(400).end(); return; }
  await fs.unlink(file.path);
  res.json({ filename: file.filename, size: file.size });
});
test("concurrent uploads have distinct safe filenames and keep browser audio format", async () => {
  const results = await Promise.all([1, 2, 3].map(() => request(app).post("/audio/fixture-session").attach("audio", Buffer.from("audio"), { filename: "unsafe.js", contentType: "audio/mp4" })));
  expect(results.every(r => r.status === 200)).toBe(true);
  const names = results.map(r => r.body.filename);
  expect(new Set(names).size).toBe(3);
  expect(names.every(name => /^[0-9a-f-]{36}\.m4a$/.test(name))).toBe(true);
});
test("non-audio MIME is rejected", async () => {
  expect((await request(app).post("/audio/fixture-session").attach("audio", Buffer.from("bad"), { filename: "audio.webm", contentType: "application/javascript" })).status).toBe(500);
});
