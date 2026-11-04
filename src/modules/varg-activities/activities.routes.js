import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { unlink } from "fs/promises";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireStaff } from "../../middleware/auth.js";
import { uploadActivityPhotos, uploadImportSheet, hasAllowedImageSignature, ACTIVITY_PHOTO } from "../../middleware/upload.js";
import { asyncHandler, success, notFound, validation, conflict } from "../../lib/errors.js";
import { scopeSql, scopeOf, assertInScope } from "../../lib/scope.js";
import { audit } from "../../lib/audit.js";
import { activitySchema, filterSchema, toCsv } from "./activities.schema.js";
import {
  readSheet, indexMasters, mastersInScope, checkRows, markDuplicates, duplicateKey,
  districtIdsOf, summarise, publicRows, buildTemplate,
} from "./activities.import.js";
import { notify, responsibleFor } from "../notifications/notifications.service.js";

// Amrut Varg activity records: the public 'Amrut Varg' portal files them and
// shows the repository; the admin panel lists, exports and removes them.

const issuesOf = (error) => error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
const discard = (files) => Promise.all(files.map((f) => unlink(f.path).catch(() => {})));

const SELECT = `SELECT a.*, v.name_mr AS division_mr, v.name_en AS division_en,
                       d.name_mr AS district_mr, d.name_en AS district_en
                FROM varg_activities a
                JOIN vibhags v ON v.id = a.division_id
                JOIN districts d ON d.id = a.district_id`;

// The WHERE clause for a parsed filter, appended to `conditions`.
function applyFilters(f, conditions, params) {
  if (f.division_id) { params.push(f.division_id); conditions.push(`a.division_id = $${params.length}`); }
  if (f.district_id) { params.push(f.district_id); conditions.push(`a.district_id = $${params.length}`); }
  if (f.frequency) { params.push(f.frequency); conditions.push(`a.frequency = $${params.length}`); }
  if (f.photo_status === "pending") conditions.push("jsonb_array_length(a.photos) = 0");
  if (f.photo_status === "added") conditions.push("jsonb_array_length(a.photos) > 0");
  if (f.search) {
    params.push(`%${f.search}%`);
    const n = params.length;
    conditions.push(`(a.institution_name ILIKE $${n} OR a.incharge_name ILIKE $${n} OR a.taluka ILIKE $${n})`);
  }
}

function parseFilters(q) {
  const parsed = filterSchema.safeParse(q ?? {});
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  return parsed.data;
}

function pageOf(q) {
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
  // `limit` is what the admin list hook sends; `pageSize` is accepted too.
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? q.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// Totals over the filtered rows, for the summary strip above the lists.
async function summaryOf(where, params) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS records,
            COALESCE(SUM(a.participant_count), 0)::int AS participants,
            COUNT(DISTINCT a.district_id)::int AS districts,
            COUNT(*) FILTER (WHERE a.frequency = 'DAILY')::int AS daily,
            COUNT(*) FILTER (WHERE a.frequency = 'WEEKLY')::int AS weekly,
            COUNT(*) FILTER (WHERE a.frequency = 'MONTHLY')::int AS monthly,
            COUNT(*) FILTER (WHERE jsonb_array_length(a.photos) = 0)::int AS photo_pending
     FROM varg_activities a WHERE ${where}`,
    params
  );
  return row;
}

// ════════════════════════════════════════════════════════════════════════════
// Public
// ════════════════════════════════════════════════════════════════════════════

export const publicRouter = Router();

const submitLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many submissions. Please try again later." } },
});

publicRouter.post(
  "/",
  submitLimit,
  uploadActivityPhotos,
  asyncHandler(async (req, res) => {
    const files = req.files ?? [];
    let data;
    try {
      const parsed = activitySchema.safeParse(req.body ?? {});
      const issues = parsed.success ? [] : issuesOf(parsed.error);

      if (files.length < ACTIVITY_PHOTO.min) {
        issues.push({ field: "photos", message: `Upload at least ${ACTIVITY_PHOTO.min} photograph${ACTIVITY_PHOTO.min === 1 ? "" : "s"}` });
      }
      for (const f of files) {
        if (!(await hasAllowedImageSignature(f.path, { allowGif: false, expectedMime: f.mimetype }))) {
          issues.push({ field: "photos", message: `${f.originalname} is not a valid JPG, PNG or WEBP image` });
        }
      }

      if (parsed.success) {
        const district = await queryOne(
          `SELECT id, vibhag_id FROM districts WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
          [parsed.data.district_id]
        );
        if (!district) issues.push({ field: "district_id", message: "Choose a valid district" });
        else if (district.vibhag_id !== parsed.data.division_id) {
          issues.push({ field: "district_id", message: "The district does not belong to the chosen division" });
        }
        if (district && parsed.data.taluka_id) {
          const taluka = await queryOne(
            `SELECT name_mr, district_id FROM talukas WHERE id = $1 AND deleted_at IS NULL`,
            [parsed.data.taluka_id]
          );
          if (!taluka || taluka.district_id !== district.id) {
            issues.push({ field: "taluka", message: "The taluka does not belong to the chosen district" });
          } else {
            parsed.data.taluka = taluka.name_mr;
          }
        }
      }
      if (issues.length) throw validation(issues);
      data = parsed.data;
    } catch (err) {
      await discard(files);
      throw err;
    }

    const photos = files.map((f) => ({
      url: `/uploads/activities/${f.filename}`,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
    }));

    // The report and its public "कार्यरत अमृत वर्ग" listing are written in one
    // transaction, like an organiser's self-published listing: the school is
    // live under its division and district the moment the reporter sees the
    // confirmation, and administrators moderate afterwards.
    let row;
    let varg;
    try {
      ({ row, varg } = await transaction(async (tx) => {
        const geo = await tx.queryOne(
          `SELECT d.name_mr AS district_mr, d.name_en AS district_en, v.name_mr AS vibhag_mr, v.name_en AS vibhag_en
           FROM districts d JOIN vibhags v ON v.id = d.vibhag_id WHERE d.id = $1`,
          [data.district_id]
        );
        const varg = await tx.queryOne(
          `INSERT INTO vargs
             (vibhag_mr, vibhag_en, district_mr, district_en, district_id, taluka, taluka_id,
              school_name, coordinator_name, enrollment_count, is_active, status, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, TRUE, 'PUBLISHED', 'activity')
           RETURNING id, vibhag_mr, vibhag_en, district_mr, district_en, district_id,
                     taluka, village, school_name, varg_name, coordinator_name, enrollment_count, status`,
          [geo.vibhag_mr, geo.vibhag_en, geo.district_mr, geo.district_en, data.district_id,
           data.taluka, data.taluka_id, data.institution_name, data.incharge_name, data.participant_count]
        );
        const row = await tx.queryOne(
          `INSERT INTO varg_activities
             (division_id, district_id, taluka_id, taluka, institution_name, incharge_name,
              incharge_mobile, participant_count, frequency, description, photos, varg_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, created_at`,
          [data.division_id, data.district_id, data.taluka_id, data.taluka, data.institution_name,
           data.incharge_name, data.incharge_mobile, data.participant_count, data.frequency,
           data.description, JSON.stringify(photos), varg.id]
        );
        return { row, varg };
      }));
    } catch (err) {
      await discard(files);
      throw err;
    }

    // The officers for that place are told a listing went live so they can
    // review it. After the response, and never fatal.
    responsibleFor({ districtId: data.district_id, divisionId: data.division_id })
      .then(({ district: d, division, state }) =>
        notify([...d, ...division, ...state], {
          title: `New Amrut Varg reported: ${varg.school_name}`,
          body: `${varg.district_mr} · Pramukh ${data.incharge_name}. Review and moderate if needed.`,
          link: `/admin/vargs/${varg.id}`,
          category: "varg",
        }))
      .catch((err) => console.error("Varg activity notice failed:", err.message));

    return success(res, { id: row.id, submitted_at: row.created_at, varg }, 201);
  })
);

// The public digital repository. The Pramukh's mobile number is not shown
// publicly; it is in the admin list and the export.
publicRouter.get("/", asyncHandler(async (req, res) => {
  const f = parseFilters(req.query);
  const { page, pageSize, offset } = pageOf(req.query);
  const conditions = ["a.deleted_at IS NULL", "a.is_active = TRUE"];
  const params = [];
  applyFilters(f, conditions, params);
  const where = conditions.join(" AND ");

  const summary = await summaryOf(where, params);
  const rows = await query(
    `${SELECT.replace("SELECT a.*", `SELECT a.id, a.division_id, a.district_id, a.taluka, a.institution_name,
            a.incharge_name, a.participant_count, a.frequency, a.description, a.photos, a.created_at`)}
     WHERE ${where} ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  return res.json({
    data: rows,
    summary,
    meta: { total: summary.records, page, pageSize, totalPages: Math.ceil(summary.records / pageSize) },
  });
}));

// ════════════════════════════════════════════════════════════════════════════
// Admin — all three tiers, each confined to its own jurisdiction
// ════════════════════════════════════════════════════════════════════════════

export const adminRouter = Router();
adminRouter.use(requireStaff);

function scopedWhere(req, f) {
  const params = [];
  const conditions = [
    "a.deleted_at IS NULL",
    scopeSql(req.user, { district: "a.district_id", division: "a.division_id" }, params),
  ];
  applyFilters(f, conditions, params);
  return { where: conditions.join(" AND "), params };
}

adminRouter.get("/", asyncHandler(async (req, res) => {
  const f = parseFilters(req.query);
  const { page, pageSize, offset } = pageOf(req.query);
  const { where, params } = scopedWhere(req, f);
  const summary = await summaryOf(where, params);
  const rows = await query(
    `${SELECT} WHERE ${where} ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  return res.json({
    data: rows,
    summary,
    meta: { total: summary.records, page, pageSize, totalPages: Math.ceil(summary.records / pageSize) },
  });
}));

const FREQUENCY_LABEL = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };

// GET /admin/varg-activities/export.csv — every row the same filters would
// list (not just one page), inside the caller's jurisdiction. A UTF-8 BOM
// leads so Excel opens the Marathi names correctly.
adminRouter.get("/export.csv", asyncHandler(async (req, res) => {
  const f = parseFilters(req.query);
  const { where, params } = scopedWhere(req, f);
  const rows = await query(`${SELECT} WHERE ${where} ORDER BY a.created_at DESC, a.id DESC`, params);
  const header = [
    "ID", "Division", "District", "Taluka", "School / Institution",
    "Amrut Varg Pramukh", "Pramukh Contact", "Students / Participants",
    "Frequency", "Photographs", "Activity Description", "Status", "Submitted At",
  ];
  const body = rows.map((r) => [
    r.id,
    r.division_en || r.division_mr,
    r.district_en || r.district_mr,
    r.taluka,
    r.institution_name,
    r.incharge_name,
    r.incharge_mobile,
    r.participant_count,
    FREQUENCY_LABEL[r.frequency] ?? r.frequency,
    Array.isArray(r.photos) ? r.photos.length : 0,
    r.description,
    r.is_active ? "Active" : "Inactive",
    new Date(r.created_at).toISOString(),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  await audit(req, "export", "varg_activities", null, { rows: rows.length, filters: f });
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="amrut-varg-activities-${stamp}.csv"`);
  res.set("Cache-Control", "no-store");
  return res.send(`﻿${toCsv(header, body)}\r\n`);
}));

// GET /admin/varg-activities/pramukhs — the Amrut Varg Pramukhs (leaders /
// in-charges) currently on record, one row per person (name + contact), from
// all three places a Pramukh is recorded:
//
//   activity      the in-charge named on an activity record (this module)
//   registration  a public "अमृत वर्ग प्रमुख" leader registration
//   varg          the coordinator named on a school's varg listing
//
// Each row carries the centres the person runs, their jurisdiction, the
// student headcount and whether any of their entries is currently active.
// Everything is confined to the caller's jurisdiction.
const PRAMUKH_SOURCES = `
  SELECT a.incharge_name AS name, a.incharge_mobile AS mobile, a.institution_name AS institution,
         a.district_id, a.division_id, a.participant_count AS students, a.frequency,
         a.is_active AS active, a.created_at AS recorded_at, 'activity' AS source
  FROM varg_activities a WHERE a.deleted_at IS NULL
  UNION ALL
  SELECT s.data->>'leaderName', COALESCE(s.data->>'coordinatorPhone', ''), COALESCE(s.data->>'institutionName', ''),
         d.id, d.vibhag_id, NULL, NULL,
         s.status <> 'archived', s.submitted_at, 'registration'
  FROM form_submissions s
  LEFT JOIN districts d ON d.deleted_at IS NULL
   AND (LOWER(TRIM(s.data->>'district')) IN (LOWER(d.name_mr), LOWER(NULLIF(d.name_en, '')))
        OR TRIM(s.data->>'district') = ANY(d.former_names))
  WHERE s.deleted_at IS NULL AND s.form_type = 'leader' AND NULLIF(TRIM(s.data->>'leaderName'), '') IS NOT NULL
  UNION ALL
  SELECT g.coordinator_name, '', g.school_name,
         g.district_id, d.vibhag_id, g.enrollment_count, NULL,
         g.is_active AND g.status = 'PUBLISHED', g.created_at, 'varg'
  FROM vargs g LEFT JOIN districts d ON d.id = g.district_id
  -- Listings published by an activity report are already counted above.
  WHERE g.deleted_at IS NULL AND g.source <> 'activity' AND NULLIF(TRIM(g.coordinator_name), '') IS NOT NULL`;

adminRouter.get("/pramukhs", asyncHandler(async (req, res) => {
  const f = parseFilters(req.query);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
  const params = [];
  const conditions = [scopeSql(req.user, { district: "p.district_id", division: "p.division_id" }, params)];
  if (f.division_id) { params.push(f.division_id); conditions.push(`p.division_id = $${params.length}`); }
  if (f.district_id) { params.push(f.district_id); conditions.push(`p.district_id = $${params.length}`); }
  if (f.search) {
    params.push(`%${f.search}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.institution ILIKE $${params.length})`);
  }
  const where = conditions.join(" AND ");
  const grouped = `
    SELECT MIN(TRIM(p.name)) AS name, p.mobile,
           COUNT(*)::int AS centres,
           COALESCE(SUM(p.students), 0)::int AS students,
           BOOL_OR(p.active) AS is_active,
           MAX(p.recorded_at) AS last_recorded,
           (ARRAY_AGG(p.institution ORDER BY p.recorded_at DESC) FILTER (WHERE p.institution <> ''))[1:3] AS institutions,
           (ARRAY_AGG(COALESCE(NULLIF(d.name_en, ''), d.name_mr) ORDER BY p.recorded_at DESC) FILTER (WHERE d.id IS NOT NULL))[1] AS district,
           (ARRAY_AGG(COALESCE(NULLIF(v.name_en, ''), v.name_mr) ORDER BY p.recorded_at DESC) FILTER (WHERE v.id IS NOT NULL))[1] AS division,
           (ARRAY_AGG(p.frequency ORDER BY p.recorded_at DESC) FILTER (WHERE p.frequency IS NOT NULL))[1] AS frequency,
           ARRAY_AGG(DISTINCT p.source) AS sources
    FROM (${PRAMUKH_SOURCES}) p
    LEFT JOIN districts d ON d.id = p.district_id
    LEFT JOIN vibhags v ON v.id = p.division_id
    WHERE ${where}
    GROUP BY LOWER(TRIM(p.name)), p.mobile`;
  const rows = await query(
    `SELECT * FROM (${grouped}) g ORDER BY g.is_active DESC, g.last_recorded DESC NULLS LAST LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  const totals = await queryOne(
    `SELECT COUNT(*)::int AS pramukhs,
            COUNT(*) FILTER (WHERE is_active)::int AS active,
            COALESCE(SUM(students), 0)::int AS students,
            COALESCE(SUM(centres), 0)::int AS centres
     FROM (${grouped}) g`,
    params
  );
  return success(res, { rows, totals });
}));

// ── Excel import ────────────────────────────────────────────────────────────
//
//   GET  /import/template.xlsx   the sheet to fill, its dropdowns confined to
//                                the caller's jurisdiction
//   POST /import/preview         checks an uploaded sheet; writes nothing
//   POST /import                 checks it again and imports the rows that pass
//
// The sheet is sent twice rather than parked on the server between the two
// steps, so there is no half-finished import to expire or clean up, and the
// commit never trusts a check made before it.

async function loadMasters() {
  const [divisions, districts, talukas] = await Promise.all([
    query(`SELECT id, name_mr, name_en, former_names FROM vibhags
           WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY display_order, name_mr`),
    query(`SELECT id, vibhag_id, name_mr, name_en, former_names FROM districts
           WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY display_order, name_mr`),
    query(`SELECT id, district_id, name_mr, name_en, former_names FROM talukas
           WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY display_order, name_mr`),
  ]);
  return { divisions, districts, talukas };
}

// Schools already on record in these districts, as duplicateKey → id. `db`
// is the pool or a transaction.
async function recordedSchools(db, districtIds) {
  if (!districtIds.length) return new Map();
  const rows = await db.query(
    `SELECT id, district_id, institution_name FROM varg_activities
     WHERE deleted_at IS NULL AND district_id = ANY($1::int[])`,
    [districtIds]
  );
  return new Map(rows.map((r) => [duplicateKey(r.district_id, r.institution_name), r.id]));
}

async function checkUpload(req) {
  if (!req.file) throw validation([{ field: "file", message: "Choose an Excel (.xlsx) file to import" }]);
  const { sheet, rows } = await readSheet(req.file.buffer);
  const checked = checkRows(rows, indexMasters(await loadMasters()), scopeOf(req.user));
  return { file: req.file.originalname, sheet, checked };
}

adminRouter.get("/import/template.xlsx", asyncHandler(async (req, res) => {
  const buffer = await buildTemplate(mastersInScope(await loadMasters(), scopeOf(req.user)));
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.set("Content-Disposition", 'attachment; filename="amrut-varg-activities-import-template.xlsx"');
  res.set("Cache-Control", "no-store");
  return res.send(buffer);
}));

adminRouter.post("/import/preview", uploadImportSheet, asyncHandler(async (req, res) => {
  const { file, sheet, checked } = await checkUpload(req);
  markDuplicates(checked, await recordedSchools({ query }, districtIdsOf(checked)));
  return success(res, { file, sheet, summary: summarise(checked), rows: publicRows(checked) });
}));

// Imports every row that passes and skips the rest; the response says which
// is which, row by row. Each record is saved hidden with an unpublished
// listing (see the schema note on `source`), and all of them are written in
// one transaction: a failure part-way leaves nothing behind.
adminRouter.post("/import", uploadImportSheet, asyncHandler(async (req, res) => {
  const { file, sheet, checked } = await checkUpload(req);

  const ids = await transaction(async (tx) => {
    // One import at a time, so the same sheet uploaded twice at once cannot
    // pass the duplicate check twice.
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('varg_activities_import'))`);
    markDuplicates(checked, await recordedSchools(tx, districtIdsOf(checked)));
    const ready = checked.filter((r) => r.data);
    if (!ready.length) return [];

    const geo = new Map((await tx.query(
      `SELECT d.id, d.name_mr AS district_mr, d.name_en AS district_en, v.name_mr AS vibhag_mr, v.name_en AS vibhag_en
       FROM districts d JOIN vibhags v ON v.id = d.vibhag_id WHERE d.id = ANY($1::int[])`,
      [districtIdsOf(ready)]
    )).map((g) => [g.id, g]));

    const created = [];
    for (const { data } of ready) {
      const g = geo.get(data.district_id);
      const varg = await tx.queryOne(
        `INSERT INTO vargs
           (vibhag_mr, vibhag_en, district_mr, district_en, district_id, taluka, taluka_id,
            school_name, coordinator_name, enrollment_count, is_active, status, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, FALSE, 'UNPUBLISHED', 'activity')
         RETURNING id`,
        [g.vibhag_mr, g.vibhag_en, g.district_mr, g.district_en, data.district_id,
         data.taluka, data.taluka_id, data.institution_name, data.incharge_name, data.participant_count]
      );
      const row = await tx.queryOne(
        `INSERT INTO varg_activities
           (division_id, district_id, taluka_id, taluka, institution_name, incharge_name,
            incharge_mobile, participant_count, frequency, description, varg_id, is_active, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, FALSE, 'import')
         RETURNING id`,
        [data.division_id, data.district_id, data.taluka_id, data.taluka, data.institution_name,
         data.incharge_name, data.incharge_mobile, data.participant_count, data.frequency,
         data.description, varg.id]
      );
      created.push(row.id);
    }
    return created;
  });

  const summary = summarise(checked);
  await audit(req, "import", "varg_activities", null, { file, sheet, imported: ids.length, skipped: summary.invalid, ids });
  return success(res, {
    file, sheet, imported: ids.length, skipped: summary.invalid, ids, summary, rows: publicRows(checked),
  }, ids.length ? 201 : 200);
}));

// An imported record's listing waits, unpublished, for the record to go
// public. Only that untouched state is lifted: a listing an officer has
// moderated since keeps the officer's decision.
function publishImportedListing(tx, vargId, userId) {
  if (!vargId) return null;
  return tx.query(
    `UPDATE vargs SET status = 'PUBLISHED', is_active = TRUE, moderated_by = $2, moderated_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND source = 'activity' AND status = 'UNPUBLISHED' AND moderated_at IS NULL AND deleted_at IS NULL`,
    [vargId, userId]
  );
}

const idSchema = z.coerce.number().int().positive();

adminRouter.get("/:id", asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw notFound("Activity");
  const row = await queryOne(`${SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id.data]);
  if (!row) throw notFound("Activity");
  await assertInScope(req.user, { districtId: row.district_id, divisionId: row.division_id });
  return success(res, row);
}));

adminRouter.patch("/:id", asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw notFound("Activity");
  const body = z.object({ is_active: z.boolean() }).safeParse(req.body ?? {});
  if (!body.success) throw validation(issuesOf(body.error));
  const row = await queryOne(
    `SELECT district_id, division_id, photos, varg_id FROM varg_activities WHERE id = $1 AND deleted_at IS NULL`,
    [id.data]
  );
  if (!row) throw notFound("Activity");
  await assertInScope(req.user, { districtId: row.district_id, divisionId: row.division_id });
  // The form's rule holds for imports too: nothing public without a photo.
  if (body.data.is_active && !(Array.isArray(row.photos) && row.photos.length)) {
    throw validation([{ field: "photos", message: "Add at least one photograph before showing this record publicly" }]);
  }
  const updated = await transaction(async (tx) => {
    const updated = await tx.queryOne(
      `UPDATE varg_activities SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active`,
      [body.data.is_active, id.data]
    );
    if (body.data.is_active) await publishImportedListing(tx, row.varg_id, req.user.id);
    return updated;
  });
  await audit(req, "update", "varg_activities", id.data, { is_active: body.data.is_active });
  return success(res, updated);
}));

// POST /admin/varg-activities/:id/photos — adds photographs to a record (an
// import arrives with none), up to the form's three in all. With show=true
// the record, and an imported record's listing, go public in the same step.
adminRouter.post("/:id/photos", uploadActivityPhotos, asyncHandler(async (req, res) => {
  const files = req.files ?? [];
  let row;
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) throw notFound("Activity");
    row = await queryOne(
      `SELECT id, district_id, division_id, photos, varg_id FROM varg_activities WHERE id = $1 AND deleted_at IS NULL`,
      [id.data]
    );
    if (!row) throw notFound("Activity");
    await assertInScope(req.user, { districtId: row.district_id, divisionId: row.division_id });

    const held = Array.isArray(row.photos) ? row.photos.length : 0;
    const issues = [];
    if (!files.length) issues.push({ field: "photos", message: "Choose at least one photograph" });
    if (held + files.length > ACTIVITY_PHOTO.max) {
      issues.push({ field: "photos", message: `A record holds at most ${ACTIVITY_PHOTO.max} photographs; this one already has ${held}` });
    }
    for (const f of files) {
      if (!(await hasAllowedImageSignature(f.path, { allowGif: false, expectedMime: f.mimetype }))) {
        issues.push({ field: "photos", message: `${f.originalname} is not a valid JPG, PNG or WEBP image` });
      }
    }
    if (issues.length) throw validation(issues);
  } catch (err) {
    await discard(files);
    throw err;
  }

  const show = String(req.body?.show ?? "") === "true";
  const added = files.map((f) => ({
    url: `/uploads/activities/${f.filename}`,
    originalName: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
  }));

  let updated;
  try {
    updated = await transaction(async (tx) => {
      // The count is checked again in the UPDATE itself, so two uploads at
      // once cannot take a record past the limit.
      const r = await tx.queryOne(
        `UPDATE varg_activities
         SET photos = photos || $1::jsonb, is_active = is_active OR $2::boolean, updated_at = NOW()
         WHERE id = $3 AND deleted_at IS NULL AND jsonb_array_length(photos) + $4 <= $5
         RETURNING id, photos, is_active`,
        [JSON.stringify(added), show, row.id, added.length, ACTIVITY_PHOTO.max]
      );
      if (!r) throw conflict("The record changed while uploading. Reload the list and try again.", "photos");
      if (show) await publishImportedListing(tx, row.varg_id, req.user.id);
      return r;
    });
  } catch (err) {
    await discard(files);
    throw err;
  }
  await audit(req, "update", "varg_activities", row.id, { photos_added: added.length, shown: show });
  return success(res, updated);
}));

adminRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw notFound("Activity");
  const row = await queryOne(`SELECT district_id, division_id FROM varg_activities WHERE id = $1 AND deleted_at IS NULL`, [id.data]);
  if (!row) throw notFound("Activity");
  await assertInScope(req.user, { districtId: row.district_id, divisionId: row.division_id });
  await transaction(async (tx) => {
    const gone = await tx.queryOne(
      `UPDATE varg_activities SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING varg_id`,
      [id.data]
    );
    // The listing this report published goes with it; a listing it did not
    // create is left alone.
    if (gone?.varg_id) {
      await tx.query(
        `UPDATE vargs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND source = 'activity' AND deleted_at IS NULL`,
        [gone.varg_id]
      );
    }
  });
  await audit(req, "delete", "varg_activities", id.data);
  return success(res, { id: id.data });
}));
