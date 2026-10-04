declare module "jsonwebtoken";
declare module "multer";
declare module "cookie-parser";
declare module "winston";

declare global {
  namespace Express {
    interface Request {
      file?: any;
      files?: any;
      requestId?: string;
    }
  }
}

export {};
