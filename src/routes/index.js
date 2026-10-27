import { Router } from "express";
import authRoutes from "./auth.routes.js";
import announcementsRoutes from "../modules/announcements/announcements.routes.js";
import storiesRoutes from "../modules/stories/stories.routes.js";
import vargsRoutes from "../modules/vargs/vargs.routes.js";
import vargsSectionRoutes from "../modules/vargs/section.routes.js";
import contactsRoutes from "../modules/contacts/contacts.routes.js";
import settingsRoutes from "../modules/settings/settings.routes.js";
import submissionsRoutes from "../modules/submissions/submissions.routes.js";
import mediaRoutes from "../modules/media/media.routes.js";
import videosRoutes from "../modules/videos/videos.routes.js";
import podcastsRoutes from "../modules/podcasts/podcasts.routes.js";
import officesRoutes from "../modules/offices/offices.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import heroRoutes from "../modules/hero/hero.routes.js";
import aboutRoutes from "../modules/about/about.routes.js";
import activitiesRoutes from "../modules/activities/activities.routes.js";
import sessionRoutes from "../modules/session/session.routes.js";
import joinRoutes from "../modules/join/join.routes.js";
import directoryRoutes from "../modules/directory/directory.routes.js";
import footerRoutes from "../modules/footer/footer.routes.js";
import yashogathaRoutes from "../modules/yashogatha/yashogatha.routes.js";
import formConfigRoutes from "../modules/forms/forms.routes.js";
import { masterRouters } from "../modules/masters/masters.routes.js";
import { publicRouter as melawaPublic, adminRouter as melawaAdmin } from "../modules/melawa/melawa.routes.js";
import { publicRouter as grievancesPublic, adminRouter as grievancesAdmin } from "../modules/grievances/grievances.routes.js";
import notificationsRoutes from "../modules/notifications/notifications.routes.js";
import usersRoutes, { auditRouter } from "../modules/users/users.routes.js";
import { MASTER_KEYS } from "../modules/masters/masters.config.js";
import { query } from "../db/pool.js";
import { asyncHandler, success } from "../lib/errors.js";

// Each module router serves its public list at "/public" and its admin routes
// at "/", "/:id" and so on. Mounting the module as-is under /public/<name> put
// the public list at /public/<name>/public and left "/" resolving to the admin
// handler — a 401 for the website. Rewriting into the "/public" subtree keeps
// the public URL at /api/v1/public/<name> and makes routes the module did not
// declare public unreachable there.
function publicOnly(routes) {
  const router = Router();
  router.use((req, _res, next) => {
    const q = req.url.indexOf("?");
    const path = q === -1 ? req.url : req.url.slice(0, q);
    const search = q === -1 ? "" : req.url.slice(q);
    req.url = `/public${path === "/" ? "" : path}${search}`;
    next();
  }, routes);
  return router;
}

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
  router.use("/public/announcements", publicOnly(announcementsRoutes));
  router.use("/public/stories", publicOnly(storiesRoutes));
  router.use("/public/vargs", publicOnly(vargsRoutes));
  router.use("/public/vargs-section", publicOnly(vargsSectionRoutes));
  router.use("/public/contacts", publicOnly(contactsRoutes));
  router.use("/public/settings", publicOnly(settingsRoutes));
  router.use("/public/hero", publicOnly(heroRoutes));
  router.use("/public/about", publicOnly(aboutRoutes));
  router.use("/public/activities", publicOnly(activitiesRoutes));
  router.use("/public/session", publicOnly(sessionRoutes));
  router.use("/public/join", publicOnly(joinRoutes));
  router.use("/public/directory", publicOnly(directoryRoutes));
  router.use("/public/footer", publicOnly(footerRoutes));
  router.use("/public/yashogatha", publicOnly(yashogathaRoutes));
  router.use("/public/forms", publicOnly(formConfigRoutes));
  router.use("/public/videos", publicOnly(videosRoutes));
  router.use("/public/podcasts", publicOnly(podcastsRoutes));
  router.use("/public/offices", publicOnly(officesRoutes));

  // Geographical masters: the same router serves the site's dropdowns and the
  // admin CRUD screens, mounted under both prefixes.
  for (const key of MASTER_KEYS) {
    router.use(`/public/masters/${key}`, publicOnly(masterRouters[key]));
  }

  // Form submissions (public)
  router.use("/forms", submissionsRoutes);

  // Amrut Varg Melawa ticker and public suggestions / complaints
  router.use("/melawa", melawaPublic);
  router.use("/grievances", grievancesPublic);

  // Admin CMS
  router.use("/admin/announcements", announcementsRoutes);
  router.use("/admin/stories", storiesRoutes);
  router.use("/admin/vargs-section", vargsSectionRoutes);
  router.use("/admin/vargs", vargsRoutes);
  router.use("/admin/contacts", contactsRoutes);
  router.use("/admin/settings", settingsRoutes);
  router.use("/admin/submissions", submissionsRoutes);
  router.use("/admin/media", mediaRoutes);
  router.use("/admin/hero", heroRoutes);
  router.use("/admin/about", aboutRoutes);
  router.use("/admin/activities", activitiesRoutes);
  router.use("/admin/session", sessionRoutes);
  router.use("/admin/join", joinRoutes);
  router.use("/admin/directory", directoryRoutes);
  router.use("/admin/footer", footerRoutes);
  router.use("/admin/yashogatha", yashogathaRoutes);
  router.use("/admin/forms", formConfigRoutes);
  router.use("/admin/videos", videosRoutes);
  router.use("/admin/podcasts", podcastsRoutes);
  router.use("/admin/offices", officesRoutes);
  for (const key of MASTER_KEYS) {
    router.use(`/admin/masters/${key}`, masterRouters[key]);
  }

  // Jurisdiction-scoped operations (all three administrative tiers)
  router.use("/admin/melawa", melawaAdmin);
  router.use("/admin/grievances", grievancesAdmin);
  router.use("/admin/notifications", notificationsRoutes);

  // State level only
  router.use("/admin/users", usersRoutes);
  router.use("/admin/audit-logs", auditRouter);

  return router;
}
