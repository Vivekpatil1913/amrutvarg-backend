import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { attachUser } from "./middleware/auth.js";
import { notFoundHandler, errorHandler } from "./middleware/error.js";
import { buildRouter } from "./routes/index.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // CORS
  app.use(
    cors({
      origin: env.cors.origins,
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ extended: true, limit: "4mb" }));
  app.use(cookieParser());

  // Serve uploads
  const uploadDir = path.resolve(process.cwd(), env.upload.dir);
  app.use("/uploads", express.static(uploadDir));

  // Global rate limit
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
    })
  );

  // Attach user from session
  app.use(attachUser);

  // API routes
  app.use("/api/v1", buildRouter());

  // 404 + global error handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
