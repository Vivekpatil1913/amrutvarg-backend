import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler, notFound, success, paginated, validation,
} from "../../lib/errors.js";
import { validateGeo } from "../masters/geo.validate.js";

const router = Router();

const schema = z.object({
  vibhag_mr: z.string().min(1).max(100),
  vibhag_en: z.string().max(100).optional().default(""),
  district_mr: z.string().min(1).max(100),
  district_en: z.string().max(100).optional().default(""),
  taluka: z.string().max(100).optional().default(""),
  school_name: z.string().min(1).max(300),
  varg_name: z.string().max(200).optional().default(""),
  coordinator_name: z.string().max(200).optional().default(""),
  enrollment_count: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
  display_order: z.number().int().optional().default(0),
});

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const search = (req.query.search || "").trim();
    const district = req.query.district || "";
    const vibhag = req.query.vibhag || "";

    const conditions = ["is_active = TRUE", "deleted_at IS NULL"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(school_name ILIKE $${params.length} OR varg_name ILIKE $${params.length} OR district_mr ILIKE $${params.length})`
      );
    }
    if (district) {
      params.push(district);
      conditions.push(`district_mr = $${params.length}`);
    }
    if (vibhag) {
      params.push(vibhag);
      conditions.push(`vibhag_mr = $${params.length}`);
    }

    const rows = await query(
      `SELECT id, vibhag_mr, vibhag_en, district_mr, district_en, taluka,
              school_name, varg_name, coordinator_name, enrollment_count, display_order
       FROM vargs WHERE ${conditions.join(" AND ")}
       ORDER BY vibhag_mr, district_mr, school_name`,
      params
    );
    return success(res, rows);
  })
);

// ── Admin ────────────────────────────────────────────────────────────────────

router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit || "25")));
    const search = (req.query.search || "").trim();
    const district = req.query.district || "";
    const vibhag = req.query.vibhag || "";
    const trash = req.query.trash === "true";
    const offset = (page - 1) * pageSize;

    const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(school_name ILIKE $${params.length} OR varg_name ILIKE $${params.length} OR district_mr ILIKE $${params.length})`
      );
    }
    if (district) {
      params.push(district);
      conditions.push(`district_mr = $${params.length}`);
    }
    if (vibhag) {
      params.push(vibhag);
      conditions.push(`vibhag_mr = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [{ count }] = await query(
      `SELECT COUNT(*) AS count FROM vargs ${where}`, params
    );

    params.push(pageSize, offset);
    const rows = await query(
      `SELECT * FROM vargs ${where}
       ORDER BY vibhag_mr, district_mr, school_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return paginated(res, rows, parseInt(count), page, pageSize);
  })
);

router.get(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      `SELECT * FROM vargs WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) throw notFound("Varg");
    return success(res, row);
  })
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    const d = parsed.data;

    // The vibhag/district/taluka combination is checked against the masters, so
    // a mistyped or mismatched name cannot reach the table the way the earlier
    // free-text inputs allowed.
    const geoIssues = await validateGeo(
      { vibhag: d.vibhag_mr, district: d.district_mr, taluka: d.taluka },
      { vibhag: "vibhag_mr", district: "district_mr", taluka: "taluka" }
    );
    if (geoIssues.length) throw validation(geoIssues);
    const [row] = await query(
      `INSERT INTO vargs
         (vibhag_mr, vibhag_en, district_mr, district_en, taluka,
          school_name, varg_name, coordinator_name, enrollment_count,
          is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [d.vibhag_mr, d.vibhag_en, d.district_mr, d.district_en, d.taluka,
       d.school_name, d.varg_name, d.coordinator_name, d.enrollment_count,
       d.is_active, d.display_order]
    );
    return success(res, row, 201);
  })
);

router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne(
      `SELECT id FROM vargs WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]
    );
    if (!existing) throw notFound("Varg");

    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    const d = parsed.data;

    // The vibhag/district/taluka combination is checked against the masters, so
    // a mistyped or mismatched name cannot reach the table the way the earlier
    // free-text inputs allowed.
    const geoIssues = await validateGeo(
      { vibhag: d.vibhag_mr, district: d.district_mr, taluka: d.taluka },
      { vibhag: "vibhag_mr", district: "district_mr", taluka: "taluka" }
    );
    if (geoIssues.length) throw validation(geoIssues);
    const [row] = await query(
      `UPDATE vargs SET
         vibhag_mr=$1, vibhag_en=$2, district_mr=$3, district_en=$4,
         taluka=$5, school_name=$6, varg_name=$7, coordinator_name=$8,
         enrollment_count=$9, is_active=$10, display_order=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [d.vibhag_mr, d.vibhag_en, d.district_mr, d.district_en, d.taluka,
       d.school_name, d.varg_name, d.coordinator_name, d.enrollment_count,
       d.is_active, d.display_order, req.params.id]
    );
    return success(res, row);
  })
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE vargs SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id]
    );
    if (!row) throw notFound("Varg");
    return success(res, { id: row.id, deleted: true });
  })
);

router.post(
  "/:id/restore",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE vargs SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
      [req.params.id]
    );
    if (!row) throw notFound("Varg");
    return success(res, { id: row.id, restored: true });
  })
);

export default router;
