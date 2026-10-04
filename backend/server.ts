/**
 * @file src/server.ts
 * @description Main entry point for the Node.js / Express backend.
 *
 * ARCHITECTURE OVERVIEW:
 * 1. Express Setup: Configures CORS, parsers, and global error handling.
 * 2. Datastore: Neon PostgreSQL is the primary datastore (`config/db.ts`);
 *    Upstash Redis is secondary — BullMQ queues, caches, XP buffer (`config/redisConfig.ts`).
 * 3. Routing: Mounts API routers (`/api/sessions`, `/api/resume`, etc.).
 * 4. Real-time (Socket.IO): Secures WebSocket connections using JWT and handles private user rooms.
 * 5. Background Jobs: Initializes BullMQ workers (`services/queue/resumeWorker.ts`) to process heavy ML tasks asynchronously.
 */

import "dotenv/config";
import { validateEnv } from "./config/envValidator.js";

// Validate environment variables early before other imports that might rely on them
validateEnv();

import express, { Express, Request, Response } from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import connectDB, { pool } from "./config/db.js";
import redisClient from "./config/redisConfig.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import codeRoutes from "./routes/codeRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import diagramRoutes from "./routes/diagramRoutes.js";

import gamificationRoutes from "./routes/gamificationRoutes.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { startResumeWorker, setWorkerIoInstance } from "./services/queue/resumeWorker.js";
import requestIdMiddleware from "./middleware/requestId.js";
import logger from "./utils/logger.js";

import { AuthenticatedSocket } from "./types/express.js";

// Ensure uploads directory exists for Multer and is clean
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
} else {
  // Clean up orphaned audio files on startup that might have been left behind after a crash
  fs.readdirSync(uploadDir).forEach((file) => {
    const filePath = path.join(uploadDir, file);
    if (fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  });
}

const resumesDir = path.join(uploadDir, "resumes");
if (!fs.existsSync(resumesDir)) {
  fs.mkdirSync(resumesDir, { recursive: true });
}

connectDB();

const app: Express = express();
const server = http.createServer(app);
const allowOrigin = process.env.FRONTEND_URL || "";
const io = new SocketIOServer(server, {
  cors: {
    origin: allowOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});

// --- Middlewares & Configuration ---
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== "production") {
        logger.debug(`[CORS DEBUG] Incoming Origin: ${origin}`);
        logger.debug(`[CORS DEBUG] Configured FRONTEND_URL: ${process.env.FRONTEND_URL}`);
      }

      const allowedOrigins = allowOrigin
        .split(",")
        .map((o) => o.trim().replace(/\/$/, "")); // Strip trailing slashes

      if (
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV === "development"
      ) {
        callback(null, true);
      } else {
        console.error(`CORS Blocked: Origin '${origin}' is not in allowed list '${allowedOrigins.join(', ')}'`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: process.env.NODE_ENV === "production" ? 100 : 500, // Limit each IP to 100 requests per window in prod, 500 in dev
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use("/api", globalLimiter);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestIdMiddleware);
// attach logger to app locals for convenient access in controllers
app.set("logger", logger);
app.set("io", io); // Make socket instance accessible to controllers

// --- Routes ---
app.get("/", (req: Request, res: Response) => {
  res.send("API is running...");
});

app.get("/health", async (req: Request, res: Response) => {
  try {
    const [pgResult, redisResult] = await Promise.allSettled([
      pool.query("SELECT 1"),
      redisClient.ping(),
    ]);
    const pgOk = pgResult.status === "fulfilled";
    const redisOk = redisResult.status === "fulfilled";

    if (pgOk && redisOk) {
      res.json({ status: "ok", db: "connected", primary: "neon-postgres", secondary: "upstash-redis" });
    } else {
      res.status(503).json({
        status: "error",
        db: pgOk ? "connected" : "disconnected",
        redis: redisOk ? "connected" : "disconnected",
      });
    }
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api/sessions", sessionRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/code", codeRoutes);
app.use("/api/user", userRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/diagrams", diagramRoutes);

app.use("/api/gamification", gamificationRoutes);

app.use(notFound);
app.use(errorHandler);

// --- Real-time Communication (Socket.IO) ---

/**
 * Socket.io Authentication Middleware
 * Supports both Auth Headers (Mobile/Postman) and HttpOnly Cookies (Web)
 */
io.use((socket, next) => {
  let token = socket.handshake.auth.token;

  // Extract token from cookies if not found in handshake (essential for cross-site browser sessions)
  if (socket.handshake.headers.cookie) {
    const cookies = socket.handshake.headers.cookie.split(";").reduce(
      (acc: Record<string, string>, c) => {
        const [k, v] = c.trim().split("=");
        acc[k] = v;
        return acc;
      },
      {}
    );
    if (cookies.jwt) token = cookies.jwt;
  }

  if (!token) return next(new Error("Authentication error: No token provided"));

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET not configured");

    const decoded = jwt.verify(token, jwtSecret);
    (socket as AuthenticatedSocket).user = decoded as any;
    next();
  } catch (err) {
    return next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
  const user = (socket as AuthenticatedSocket).user;
  if (user) {
    logger.info("User connected via socket", { userId: user.id });
  }

  const userId = socket.handshake.query.userId as string;

  // Securely join a private room matching the user's ID
  if (userId && user && (user.id === userId || user._id === userId)) {
    socket.join(userId);
  } else if (userId) {
    socket.emit("error", "Unauthorized access to this room");
  }

  socket.on("joinRoom", ({ userId: roomUserId }) => {
    if (roomUserId && user && (user.id === roomUserId || user._id === roomUserId)) {
      socket.join(roomUserId);
      console.log(`User ${roomUserId} explicitly joined room`);
    }
  });

  socket.on("disconnect", () => {
    logger.info("User disconnected");
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);

  // Start BullMQ Worker and inject IO instance
  setWorkerIoInstance(io);
  startResumeWorker();
  logger.info("Resume processing worker started");
});

export default app;
