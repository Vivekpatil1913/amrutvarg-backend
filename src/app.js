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

  // How many proxies sit in front of Node; see TRUST_PROXY in config/env.js.
  app.set("trust proxy", env.trustProxy);
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

  // Serve uploads. Grievance attachments are excluded: they are a citizen's
  // evidence, served only through the jurisdiction-checked admin route.
  const uploadDir = path.resolve(process.cwd(), env.upload.dir);
  app.use("/uploads/grievances", (req, res) =>
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));
  app.use("/uploads", express.static(uploadDir));

  // Attach user from session. Runs before the rate limit, which needs to know
  // who is signed in; a request with no valid token costs no database query.
  app.use(attachUser);

  // Global rate limit, for anonymous traffic only. Sign-in is left out because
  // it has its own stricter limit in auth.routes.js, so public page views from
  // a shared IP can never lock an admin out of the panel.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => Boolean(req.user) || req.path === "/api/v1/auth/login",
      message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
    })
  );

  // API routes
  app.use("/api/v1", buildRouter());

  // 404 + global error handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
