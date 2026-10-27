import { Router } from "express";
import { query, queryOne } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { requireAdmin, requireStaff } from "../../middleware/auth.js";
import { asyncHandler, success } from "../../lib/errors.js";
import { scopeOf, scopeDistrictIds } from "../../lib/scope.js";
import { slaSql } from "../grievances/grievances.sla.js";

const router = Router();

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const [[ann], [stories], [vargs], [contacts], [newSubs], [totalSubs], submissionTrend, submissionStatuses, dailySubmissions] = await Promise.all([
    query(`SELECT COUNT(*) AS count FROM announcements WHERE deleted_at IS NULL AND is_active = TRUE`),
    query(`SELECT COUNT(*) AS count FROM stories WHERE deleted_at IS NULL AND published = TRUE`),
    query(`SELECT COUNT(*) AS count FROM vargs WHERE deleted_at IS NULL AND is_active = TRUE`),
    query(`SELECT COUNT(*) AS count FROM district_contacts WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*) AS count FROM form_submissions WHERE deleted_at IS NULL AND status = 'new'`),
    query(`SELECT COUNT(*) AS count FROM form_submissions WHERE deleted_at IS NULL`),
    query(
      `SELECT TO_CHAR(date_trunc('month', submitted_at), 'YYYY-MM') AS month,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'new')::int AS new
       FROM form_submissions
       WHERE deleted_at IS NULL
         AND submitted_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
       GROUP BY date_trunc('month', submitted_at)
       ORDER BY date_trunc('month', submitted_at)`
    ),
    query(
      `SELECT status, COUNT(*)::int AS total
       FROM form_submissions
       WHERE deleted_at IS NULL
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
        AND submissions.deleted_at IS NULL
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

// ── Jurisdiction overview ───────────────────────────────────────────────────
//
// One endpoint for all three tiers; what comes back depends on who asks.
//
//   state     totals, plus one row per division to drill into
//   division  totals for the division, plus one row per district
//   district  totals for the district, plus its varg / Varga Pramukh roster
//
// Every figure is computed per district first and rolled up, so the three
// views can never disagree with one another. A submission is placed in a
// district through the varg it names, or else through its district name.

const SLA = slaSql(env.sla, "g");

async function perDistrict(districtIds) {
  const params = [];
  let filter = "";
  if (districtIds !== null) {
    params.push(districtIds);
    filter = `AND d.id = ANY($1)`;
  }
  return query(
    `WITH placed AS (
       SELECT s.form_type, COALESCE(v.district_id, nd.id) AS district_id
       FROM form_submissions s
       LEFT JOIN vargs v
         ON v.id = CASE WHEN s.data->>'amrutVargId' ~ '^[0-9]{1,9}$' THEN (s.data->>'amrutVargId')::int END
       LEFT JOIN LATERAL (
         SELECT d.id FROM districts d
         WHERE d.deleted_at IS NULL AND TRIM(COALESCE(s.data->>'district', '')) <> ''
           AND (LOWER(d.name_mr) = LOWER(TRIM(s.data->>'district'))
                OR LOWER(NULLIF(d.name_en, '')) = LOWER(TRIM(s.data->>'district'))
                OR TRIM(s.data->>'district') = ANY(d.former_names))
         LIMIT 1
       ) nd ON TRUE
       WHERE s.deleted_at IS NULL
     ),
     subs AS (
       SELECT district_id,
              COUNT(*) FILTER (WHERE form_type = 'participant')::int AS students,
              COUNT(*) FILTER (WHERE form_type = 'leader')::int AS pramukh_registrations,
              COUNT(*) FILTER (WHERE form_type = 'organizer')::int AS organizers
       FROM placed WHERE district_id IS NOT NULL GROUP BY district_id
     ),
     vg AS (
       SELECT district_id,
              COUNT(*) FILTER (WHERE is_active AND status = 'PUBLISHED')::int AS vargs,
              COUNT(*) FILTER (WHERE status = 'FLAGGED')::int AS flagged,
              COUNT(*) FILTER (WHERE source = 'organizer')::int AS self_published,
              COUNT(DISTINCT NULLIF(TRIM(coordinator_name), '')) FILTER (WHERE is_active AND status = 'PUBLISHED')::int AS pramukhs,
              COALESCE(SUM(enrollment_count) FILTER (WHERE is_active AND status = 'PUBLISHED'), 0)::int AS enrolled
       FROM vargs WHERE deleted_at IS NULL AND district_id IS NOT NULL GROUP BY district_id
     ),
     gr AS (
       SELECT g.district_id,
              COUNT(*) FILTER (WHERE g.status NOT IN ('RESOLVED', 'CLOSED'))::int AS open_grievances,
              COUNT(*) FILTER (WHERE (${SLA}) = 'AMBER')::int AS amber,
              COUNT(*) FILTER (WHERE (${SLA}) = 'RED')::int AS red,
              COUNT(*) FILTER (WHERE g.status IN ('RESOLVED', 'CLOSED'))::int AS resolved,
              ROUND(AVG(EXTRACT(EPOCH FROM (g.acknowledged_at - g.created_at)) / 3600)::numeric, 1)::float AS avg_ack_hours,
              ROUND(AVG(EXTRACT(EPOCH FROM (g.resolved_at - g.created_at)) / 3600)::numeric, 1)::float AS avg_resolution_hours
       FROM grievances g WHERE g.deleted_at IS NULL GROUP BY g.district_id
     ),
     mgr AS (
       SELECT district_id, STRING_AGG(name, ', ' ORDER BY name) AS managers
       FROM admin_users WHERE is_active AND role = 'district_manager' AND district_id IS NOT NULL
       GROUP BY district_id
     )
     SELECT d.id, d.vibhag_id, d.name_mr, d.name_en,
            COALESCE(vg.vargs, 0) AS vargs, COALESCE(vg.flagged, 0) AS flagged,
            COALESCE(vg.self_published, 0) AS self_published,
            COALESCE(vg.pramukhs, 0) AS pramukhs, COALESCE(vg.enrolled, 0) AS enrolled,
            COALESCE(subs.students, 0) AS students,
            COALESCE(subs.pramukh_registrations, 0) AS pramukh_registrations,
            COALESCE(subs.organizers, 0) AS organizers,
            COALESCE(gr.open_grievances, 0) AS open_grievances,
            COALESCE(gr.amber, 0) AS amber, COALESCE(gr.red, 0) AS red,
            COALESCE(gr.resolved, 0) AS resolved,
            gr.avg_ack_hours, gr.avg_resolution_hours,
            COALESCE(mgr.managers, '') AS managers
     FROM districts d
     LEFT JOIN vg ON vg.district_id = d.id
     LEFT JOIN subs ON subs.district_id = d.id
     LEFT JOIN gr ON gr.district_id = d.id
     LEFT JOIN mgr ON mgr.district_id = d.id
     WHERE d.deleted_at IS NULL ${filter}
     ORDER BY d.display_order, d.name_mr`,
    params
  );
}

const COUNTS = [
  "vargs", "flagged", "self_published", "pramukhs", "enrolled", "students",
  "pramukh_registrations", "organizers", "open_grievances", "amber", "red", "resolved",
];

// Sums the count columns; averages are weighted by how many tickets fed them.
function rollUp(rows) {
  const total = Object.fromEntries(COUNTS.map((k) => [k, 0]));
  let ackWeight = 0, ackSum = 0, resWeight = 0, resSum = 0;
  for (const r of rows) {
    COUNTS.forEach((k) => { total[k] += Number(r[k]) || 0; });
    const n = (Number(r.open_grievances) || 0) + (Number(r.resolved) || 0);
    if (r.avg_ack_hours != null && n) { ackSum += r.avg_ack_hours * n; ackWeight += n; }
    if (r.avg_resolution_hours != null && r.resolved) { resSum += r.avg_resolution_hours * r.resolved; resWeight += Number(r.resolved); }
  }
  total.avg_ack_hours = ackWeight ? Math.round((ackSum / ackWeight) * 10) / 10 : null;
  total.avg_resolution_hours = resWeight ? Math.round((resSum / resWeight) * 10) / 10 : null;
  return total;
}

router.get("/overview", requireStaff, asyncHandler(async (req, res) => {
  const scope = scopeOf(req.user);
  const ids = await scopeDistrictIds(req.user);
  const districts = await perDistrict(ids);
  const totals = rollUp(districts);

  const scopeParams = [];
  let melawaScope = "TRUE";
  if (scope.level === "division") { scopeParams.push(scope.vibhagId); melawaScope = `m.target_division_id = $1`; }
  if (scope.level === "district") { scopeParams.push(scope.districtId); melawaScope = `m.target_district_id = $1`; }
  if (scope.level === "none") melawaScope = "FALSE";
  const [melawa, critical, staffAccounts] = await Promise.all([
    queryOne(
      `SELECT COUNT(*)::int AS live FROM melawa_events m
       WHERE m.is_active AND m.deleted_at IS NULL
         AND ((COALESCE(m.end_date, m.event_date) + m.end_time) AT TIME ZONE 'Asia/Kolkata') > NOW()
         AND (${melawaScope} ${scope.level === "state" ? "" : "OR m.jurisdiction_scope = 'STATE'"})`,
      scopeParams
    ),
    queryOne(
      `SELECT COUNT(*)::int AS count FROM grievances g
       WHERE g.deleted_at IS NULL AND g.escalation_level >= 2 AND g.status NOT IN ('RESOLVED', 'CLOSED')
         ${ids === null ? "" : "AND g.district_id = ANY($1)"}`,
      ids === null ? [] : [ids]
    ),
    // Active administrator accounts, all tiers — a state-level figure only.
    queryOne(`SELECT COUNT(*)::int AS count FROM admin_users WHERE is_active`),
  ]);

  let breakdown = [];
  let breakdownLevel = null;
  if (scope.level === "state") {
    breakdownLevel = "division";
    const vibhags = await query(`SELECT id, name_mr, name_en FROM vibhags WHERE deleted_at IS NULL ORDER BY display_order, name_mr`);
    const divisionManagers = await query(
      `SELECT vibhag_id, STRING_AGG(name, ', ' ORDER BY name) AS managers
       FROM admin_users WHERE is_active AND role = 'division_manager' GROUP BY vibhag_id`
    );
    breakdown = vibhags.map((v) => ({
      id: v.id, name_mr: v.name_mr, name_en: v.name_en,
      districts: districts.filter((d) => d.vibhag_id === v.id).length,
      managers: divisionManagers.find((m) => m.vibhag_id === v.id)?.managers || "",
      ...rollUp(districts.filter((d) => d.vibhag_id === v.id)),
    }));
  } else if (scope.level === "division") {
    breakdownLevel = "district";
    breakdown = districts;
  }

  let roster = null;
  if (scope.level === "district") {
    const [vargs, leaders] = await Promise.all([
      query(
        `SELECT id, school_name, varg_name, taluka, village, coordinator_name, enrollment_count, status, source
         FROM vargs WHERE deleted_at IS NULL AND district_id = $1
         ORDER BY status <> 'FLAGGED', school_name`,
        [scope.districtId]
      ),
      query(
        `SELECT s.id, s.data->>'leaderName' AS name, s.data->>'institutionName' AS institution,
                s.data->>'coordinatorPhone' AS phone, s.data->>'taluka' AS taluka, s.status, s.submitted_at
         FROM form_submissions s
         JOIN districts d ON d.id = $1
         WHERE s.deleted_at IS NULL AND s.form_type = 'leader'
           AND (LOWER(TRIM(s.data->>'district')) IN (LOWER(d.name_mr), LOWER(NULLIF(d.name_en, '')))
                OR TRIM(s.data->>'district') = ANY(d.former_names))
         ORDER BY s.submitted_at DESC LIMIT 100`,
        [scope.districtId]
      ),
    ]);
    roster = { vargs, leaders };
  }

  const place = scope.level === "district"
    ? await queryOne(`SELECT d.name_mr, d.name_en, v.name_mr AS vibhag_mr, v.name_en AS vibhag_en FROM districts d JOIN vibhags v ON v.id = d.vibhag_id WHERE d.id = $1`, [scope.districtId])
    : scope.level === "division"
      ? await queryOne(`SELECT name_mr, name_en FROM vibhags WHERE id = $1`, [scope.vibhagId])
      : null;

  return success(res, {
    scope: { level: scope.level, role: req.user.role, place },
    totals: {
      ...totals,
      critical: critical.count,
      live_melawa: melawa.live,
      ...(scope.level === "state" ? { staff_accounts: staffAccounts.count } : {}),
    },
    breakdownLevel,
    breakdown,
    // Every district in scope, so a division row can be drilled into without
    // another request.
    districts: scope.level === "district" ? [] : districts,
    roster,
  });
}));

export default router;
