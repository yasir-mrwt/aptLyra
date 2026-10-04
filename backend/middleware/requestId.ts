import { Request, Response, NextFunction } from "express";
import { getOrGenerateRequestId } from "../utils/requestId.js";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incoming = (req.headers["x-request-id"] as string) || undefined;
  const requestId = getOrGenerateRequestId(incoming);
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  // also expose to locals for downstream use
  res.locals.requestId = requestId;
  next();
};

export default requestIdMiddleware;
