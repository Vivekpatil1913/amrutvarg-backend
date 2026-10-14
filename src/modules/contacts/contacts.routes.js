import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler, notFound, success, paginated, validation,
} from "../../lib/errors.js";
import { validateGeo, validateDistrictList } from "../masters/geo.validate.js";

const router = Router();

const schema = z.object({
  division_mr: z.string().min(1).max(100),
  division_en: z.string().max(100).optional().default(""),
  role: z.string().min(1).max(50),
  districts: z.array(z.string()).optional().default([]),
  name: z.string().min(1).max(200),
  email: z.string().max(200).optional().default(""),
  phone: z.string().max(20).optional().default(""),
  is_active: z.boolean().optional().default(true),
  display_order: z.number().int().optional().default(0),
});

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const search = (req.query.search || "").trim();
    const district = req.query.district || "";
    const division = req.query.division || "";

    const conditions = ["is_active = TRUE", "deleted_at IS NULL"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`
      );
    }
    if (district) {
      params.push(district);
      conditions.push(`$${params.length} = ANY(districts)`);
    }
    if (division) {
      params.push(division);
      conditions.push(`division_mr = $${params.length}`);
    }

    const rows = await query(
      `SELECT id, division_mr, division_en, role, districts, name, email, phone, display_order
       FROM district_contacts WHERE ${conditions.join(" AND ")}
       ORDER BY division_mr, display_order, role`,
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
    const division = req.query.division || "";
    const trash = req.query.trash === "true";
    const offset = (page - 1) * pageSize;

    const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR email ILIKE $${params.length})`
      );
    }
    if (division) {
      params.push(division);
      conditions.push(`division_mr = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [{ count }] = await query(
      `SELECT COUNT(*) AS count FROM district_contacts ${where}`, params
    );

    params.push(pageSize, offset);
    const rows = await query(
      `SELECT * FROM district_contacts ${where}
       ORDER BY division_mr, display_order, role
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return paginated(res, rows, parseInt(count), page, pageSize);
  })
);

router.get("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const row = await queryOne(`SELECT * FROM district_contacts WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
  if (!row) throw notFound("Contact");
  return success(res, row);
}));

router.post("/", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const d = parsed.data;

  // Division must be a real vibhag, and every district listed must belong to it.
  const geoIssues = [
    ...(await validateGeo({ vibhag: d.division_mr }, { vibhag: "division_mr" })),
    ...(await validateDistrictList(d.districts, d.division_mr, "districts")),
  ];
  if (geoIssues.length) throw validation(geoIssues);
  const [row] = await query(
    `INSERT INTO district_contacts (division_mr, division_en, role, districts, name, email, phone, is_active, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.division_mr, d.division_en, d.role, d.districts, d.name, d.email, d.phone, d.is_active, d.display_order]
  );
  return success(res, row, 201);
}));

router.put("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const existing = await queryOne(`SELECT id FROM district_contacts WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
  if (!existing) throw notFound("Contact");
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const d = parsed.data;

  // Division must be a real vibhag, and every district listed must belong to it.
  const geoIssues = [
    ...(await validateGeo({ vibhag: d.division_mr }, { vibhag: "division_mr" })),
    ...(await validateDistrictList(d.districts, d.division_mr, "districts")),
  ];
  if (geoIssues.length) throw validation(geoIssues);
  const [row] = await query(
    `UPDATE district_contacts SET division_mr=$1, division_en=$2, role=$3, districts=$4, name=$5, email=$6, phone=$7, is_active=$8, display_order=$9, updated_at=NOW() WHERE id=$10 RETURNING *`,
    [d.division_mr, d.division_en, d.role, d.districts, d.name, d.email, d.phone, d.is_active, d.display_order, req.params.id]
  );
  return success(res, row);
}));

router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const [row] = await query(`UPDATE district_contacts SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [req.params.id]);
  if (!row) throw notFound("Contact");
  return success(res, { id: row.id, deleted: true });
}));

router.post("/:id/restore", requireAdmin, asyncHandler(async (req, res) => {
  const [row] = await query(`UPDATE district_contacts SET deleted_at = NULL, updated_at = NOW() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`, [req.params.id]);
  if (!row) throw notFound("Contact");
  return success(res, { id: row.id, restored: true });
}));

export default router;
