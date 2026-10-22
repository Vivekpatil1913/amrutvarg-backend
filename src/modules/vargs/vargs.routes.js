import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler, notFound, success, paginated, validation,
} from "../../lib/errors.js";
import { validateGeo, resolveDistrictTaluka } from "../masters/geo.validate.js";
import { vargSchema } from "./vargs.schema.js";

const router = Router();

// Field rules live in vargs.schema.js; the relationship checks below need
// the masters and so stay here.
const schema = vargSchema;

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
    // Filtering by id is exact where filtering by name depends on spelling.
    // Offered alongside the name filter rather than replacing it, because the
    // site's existing links carry names.
    const districtId = Number(req.query.district_id);
    if (Number.isSafeInteger(districtId) && districtId > 0) {
      params.push(districtId);
      conditions.push(`district_id = $${params.length}`);
    }
    if (vibhag) {
      params.push(vibhag);
      conditions.push(`vibhag_mr = $${params.length}`);
    }

    const rows = await query(
      `SELECT id, vibhag_mr, vibhag_en, district_mr, district_en, district_id,
              taluka, taluka_id, village,
              school_name, varg_name, coordinator_name, enrollment_count, display_order,
              resource_url
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

// Validates a submitted school location and returns the values to persist.
//
// Shared by create and update so the two cannot drift. Where ids are supplied
// they win: the district and taluka NAMES written to the row are read back off
// the resolved master rows rather than taken from the request, which is what
// guarantees a record's name and its id always describe the same place.
async function resolveLocation(d) {
  const { issues, district, taluka } = await resolveDistrictTaluka(
    {
      districtId: d.district_id,
      districtName: d.district_mr,
      talukaId: d.taluka_id,
      talukaName: d.taluka,
    },
    { district: "district_mr", taluka: "taluka" }
  );
  if (issues.length) throw validation(issues);

  const values = {
    district_mr: district ? district.name_mr : d.district_mr,
    district_en: district ? district.name_en || d.district_en : d.district_en,
    district_id: district?.id ?? null,
    taluka: taluka ? taluka.name_mr : d.taluka,
    taluka_id: taluka?.id ?? null,
  };

  // The name-level checks still run: they cover the vibhag, which has no id
  // field on this record, and they report a district name that matches no
  // master at all.
  const geoIssues = await validateGeo(
    { vibhag: d.vibhag_mr, district: values.district_mr, taluka: values.taluka },
    { vibhag: "vibhag_mr", district: "district_mr", taluka: "taluka" }
  );
  if (geoIssues.length) throw validation(geoIssues);

  return values;
}

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    const d = parsed.data;
    const loc = await resolveLocation(d);

    const [row] = await query(
      `INSERT INTO vargs
         (vibhag_mr, vibhag_en, district_mr, district_en, district_id,
          taluka, taluka_id, village,
          school_name, varg_name, coordinator_name, enrollment_count,
          is_active, display_order, resource_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [d.vibhag_mr, d.vibhag_en, loc.district_mr, loc.district_en, loc.district_id,
       loc.taluka, loc.taluka_id, d.village || null,
       d.school_name, d.varg_name, d.coordinator_name, d.enrollment_count,
       d.is_active, d.display_order, d.resource_url || null]
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
    const loc = await resolveLocation(d);

    const [row] = await query(
      `UPDATE vargs SET
         vibhag_mr=$1, vibhag_en=$2, district_mr=$3, district_en=$4, district_id=$5,
         taluka=$6, taluka_id=$7, village=$8,
         school_name=$9, varg_name=$10, coordinator_name=$11,
         enrollment_count=$12, is_active=$13, display_order=$14,
         resource_url=$15, updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [d.vibhag_mr, d.vibhag_en, loc.district_mr, loc.district_en, loc.district_id,
       loc.taluka, loc.taluka_id, d.village || null,
       d.school_name, d.varg_name, d.coordinator_name, d.enrollment_count,
       d.is_active, d.display_order, d.resource_url || null, req.params.id]
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
