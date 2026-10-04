/**
 * @file types/express.ts
 * @description Shared Express Request and Socket type extensions
 */

import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export interface AuthenticatedSocket {
  user?: any;
  handshake: any;
}
