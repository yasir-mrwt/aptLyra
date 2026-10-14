import { Request, Response, NextFunction } from "express";
import { timingContext } from "../utils/timings.js";
import { performance } from "node:perf_hooks";
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
  const started=performance.now(), context={requestId,stages:{}};
  res.on("finish",()=>console.info(JSON.stringify({event:"request_timing",requestId,status:res.statusCode,totalMs:Math.round(performance.now()-started),stages:context.stages})));
  timingContext.run(context,next);
};

export default requestIdMiddleware;
