import { Router } from "express";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler, notFound, success, paginated, validation,
} from "../../lib/errors.js";
import { validateGeo, validateDistrictList } from "../masters/geo.validate.js";
import { DEFAULT_DIRECTORY } from "../directory/directory.defaults.js";
import { contactSchema, issuesOf } from "./contacts.schema.js";

const router = Router();

// Role ids live in the Directory section, which is also where their badge
// labels come from. Reading them here keeps the picker, the public badge and
// this check on one list — a contact can no longer be saved with a role that
// renders as a bare id on the site. The draft is preferred over the published
// copy so a role added in the Directory editor is usable straight away.
async function roleOptions() {
  const row = await queryOne(`SELECT draft, published FROM directory_section WHERE id = 1`);
  const cfg =
    (row?.draft && Object.keys(row.draft).length && row.draft) ||
    (row?.published && Object.keys(row.published).length && row.published) ||
    DEFAULT_DIRECTORY;
  const roles = Array.isArray(cfg.roles) && cfg.roles.length ? cfg.roles : DEFAULT_DIRECTORY.roles;
  return roles.map((r) => ({ value: r.id, label: r.label_en || r.label_mr, label_mr: r.label_mr }));
}

// Division, districts and role all have to agree with lists kept elsewhere, so
// they are checked together and reported as one set of field-level issues.
async function relationIssues(d) {
  const roles = await roleOptions();
  return [
    ...(await validateGeo({ vibhag: d.division_mr }, { vibhag: "division_mr" })),
    ...(await validateDistrictList(d.districts, d.division_mr, "districts")),
    ...(roles.some((r) => r.value === d.role)
      ? []
      : [{ field: "role", message: `Unknown role "${d.role}" — add it under Website › Directory Page` }]),
  ];
}

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

// Declared before "/:id" so the literal path is not swallowed by the
// parameterised one. The editor builds its Role picker from this, so the two
// sides cannot disagree about what is valid.
router.get("/roles", requireAdmin, asyncHandler(async (req, res) =>
  success(res, { roles: await roleOptions() })
));

router.get("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const row = await queryOne(`SELECT * FROM district_contacts WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
  if (!row) throw notFound("Contact");
  return success(res, row);
}));

router.post("/", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const d = parsed.data;

  const issues = await relationIssues(d);
  if (issues.length) throw validation(issues);
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
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const d = parsed.data;

  const issues = await relationIssues(d);
  if (issues.length) throw validation(issues);
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
