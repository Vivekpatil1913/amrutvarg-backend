import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { unlink } from "fs/promises";
import { query, queryOne } from "../../db/pool.js";
import { requireStaff } from "../../middleware/auth.js";
import { uploadActivityPhotos, hasAllowedImageSignature, ACTIVITY_PHOTO } from "../../middleware/upload.js";
import { asyncHandler, success, notFound, validation } from "../../lib/errors.js";
import { scopeSql, assertInScope } from "../../lib/scope.js";
import { audit } from "../../lib/audit.js";
import { activitySchema, filterSchema, toCsv } from "./activities.schema.js";

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
            COUNT(*) FILTER (WHERE a.frequency = 'MONTHLY')::int AS monthly
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
        issues.push({ field: "photos", message: `Upload at least ${ACTIVITY_PHOTO.min} photographs` });
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

    let row;
    try {
      row = await queryOne(
        `INSERT INTO varg_activities
           (division_id, district_id, taluka_id, taluka, institution_name, incharge_name,
            incharge_mobile, participant_count, frequency, description, photos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
        [data.division_id, data.district_id, data.taluka_id, data.taluka, data.institution_name,
         data.incharge_name, data.incharge_mobile, data.participant_count, data.frequency,
         data.description, JSON.stringify(photos)]
      );
    } catch (err) {
      await discard(files);
      throw err;
    }
    return success(res, { id: row.id, submitted_at: row.created_at }, 201);
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
  const row = await queryOne(`SELECT district_id, division_id FROM varg_activities WHERE id = $1 AND deleted_at IS NULL`, [id.data]);
  if (!row) throw notFound("Activity");
  await assertInScope(req.user, { districtId: row.district_id, divisionId: row.division_id });
  const updated = await queryOne(
    `UPDATE varg_activities SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active`,
    [body.data.is_active, id.data]
  );
  await audit(req, "update", "varg_activities", id.data, { is_active: body.data.is_active });
  return success(res, updated);
}));

adminRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw notFound("Activity");
  const row = await queryOne(`SELECT district_id, division_id FROM varg_activities WHERE id = $1 AND deleted_at IS NULL`, [id.data]);
  if (!row) throw notFound("Activity");
  await assertInScope(req.user, { districtId: row.district_id, divisionId: row.division_id });
  await query(`UPDATE varg_activities SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id.data]);
  await audit(req, "delete", "varg_activities", id.data);
  return success(res, { id: id.data });
}));
