import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success } from "../../lib/errors.js";

const router = Router();

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const [[ann], [stories], [vargs], [contacts], [newSubs], [totalSubs], submissionTrend, submissionStatuses, dailySubmissions] = await Promise.all([
    query(`SELECT COUNT(*) AS count FROM announcements WHERE deleted_at IS NULL AND is_active = TRUE`),
    query(`SELECT COUNT(*) AS count FROM stories WHERE deleted_at IS NULL AND published = TRUE`),
    query(`SELECT COUNT(*) AS count FROM vargs WHERE deleted_at IS NULL AND is_active = TRUE`),
    query(`SELECT COUNT(*) AS count FROM district_contacts WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*) AS count FROM form_submissions WHERE status = 'new'`),
    query(`SELECT COUNT(*) AS count FROM form_submissions`),
    query(
      `SELECT TO_CHAR(date_trunc('month', submitted_at), 'YYYY-MM') AS month,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'new')::int AS new
       FROM form_submissions
       WHERE submitted_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
       GROUP BY date_trunc('month', submitted_at)
       ORDER BY date_trunc('month', submitted_at)`
    ),
    query(
      `SELECT status, COUNT(*)::int AS total
       FROM form_submissions
       GROUP BY status
       ORDER BY status`
    ),
    query(
      `SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS day,
              COUNT(submissions.id)::int AS total
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS days(day)
       LEFT JOIN form_submissions submissions
         ON submissions.submitted_at >= days.day
        AND submissions.submitted_at < days.day + INTERVAL '1 day'
       GROUP BY days.day
       ORDER BY days.day`
    ),
  ]);

  return success(res, {
    stats: {
      activeAnnouncements: parseInt(ann.count),
      publishedStories: parseInt(stories.count),
      activeVargs: parseInt(vargs.count),
      teamContacts: parseInt(contacts.count),
      newSubmissions: parseInt(newSubs.count),
      totalSubmissions: parseInt(totalSubs.count),
    },
    submissionTrend,
    submissionStatuses,
    dailySubmissions,
  });
}));

export default router;
