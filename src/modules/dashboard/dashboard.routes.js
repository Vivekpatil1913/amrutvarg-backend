import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success } from "../../lib/errors.js";

const router = Router();

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const [[ann], [stories], [vargs], [contacts], [newSubs], [totalSubs]] = await Promise.all([
    query(`SELECT COUNT(*) AS count FROM announcements WHERE deleted_at IS NULL AND is_active = TRUE`),
    query(`SELECT COUNT(*) AS count FROM stories WHERE deleted_at IS NULL AND published = TRUE`),
    query(`SELECT COUNT(*) AS count FROM vargs WHERE deleted_at IS NULL AND is_active = TRUE`),
    query(`SELECT COUNT(*) AS count FROM district_contacts WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*) AS count FROM form_submissions WHERE status = 'new'`),
    query(`SELECT COUNT(*) AS count FROM form_submissions`),
  ]);

  const recentSubmissions = await query(
    `SELECT id, form_type, status, data->>'name' AS name, submitted_at
     FROM form_submissions ORDER BY submitted_at DESC LIMIT 5`
  );

  return success(res, {
    stats: {
      activeAnnouncements: parseInt(ann.count),
      publishedStories: parseInt(stories.count),
      activeVargs: parseInt(vargs.count),
      teamContacts: parseInt(contacts.count),
      newSubmissions: parseInt(newSubs.count),
      totalSubmissions: parseInt(totalSubs.count),
    },
    recentSubmissions,
  });
}));

export default router;
