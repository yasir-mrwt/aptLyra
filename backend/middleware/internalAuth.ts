import { timingSafeEqual, createHash } from "node:crypto";
import { Request, Response, NextFunction } from "express";

/** Internal callbacks use the same shared secret as Node → FastAPI calls. */
export function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_API_KEY;
  const supplied = req.get("X-API-Key");
  if (!expected) { res.status(503).json({ message: "Internal callback authentication unavailable" }); return; }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(expected))) {
    res.status(401).json({ message: "Invalid or missing internal API key" }); return;
  }
  next();
}
