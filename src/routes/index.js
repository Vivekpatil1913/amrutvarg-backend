import { Router } from "express";
import authRoutes from "./auth.routes.js";
import announcementsRoutes from "../modules/announcements/announcements.routes.js";
import storiesRoutes from "../modules/stories/stories.routes.js";
import vargsRoutes from "../modules/vargs/vargs.routes.js";
import contactsRoutes from "../modules/contacts/contacts.routes.js";
import settingsRoutes from "../modules/settings/settings.routes.js";
import submissionsRoutes from "../modules/submissions/submissions.routes.js";
import mediaRoutes from "../modules/media/media.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import { query } from "../db/pool.js";
import { asyncHandler, success } from "../lib/errors.js";

export function buildRouter() {
  const router = Router();

  router.get("/health", asyncHandler(async (req, res) => {
    await query("SELECT 1");
    return success(res, { status: "ok", database: "connected" });
  }));

  // Auth
  router.use("/auth", authRoutes);

  // Dashboard
  router.use("/admin/dashboard", dashboardRoutes);

  // CMS modules (public)
  router.use("/public/announcements", announcementsRoutes);
  router.use("/public/stories", storiesRoutes);
  router.use("/public/vargs", vargsRoutes);
  router.use("/public/contacts", contactsRoutes);
  router.use("/public/settings", settingsRoutes);

  // Form submissions (public)
  router.use("/forms", submissionsRoutes);

  // Admin CMS
  router.use("/admin/announcements", announcementsRoutes);
  router.use("/admin/stories", storiesRoutes);
  router.use("/admin/vargs", vargsRoutes);
  router.use("/admin/contacts", contactsRoutes);
  router.use("/admin/settings", settingsRoutes);
  router.use("/admin/submissions", submissionsRoutes);
  router.use("/admin/media", mediaRoutes);

  return router;
}
