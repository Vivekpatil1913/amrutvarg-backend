import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler, notFound, success, paginated, validation, conflict,
} from "../../lib/errors.js";
import { resolveById } from "../masters/geo.validate.js";
import { officeSchema } from "./offices.schema.js";

const router = Router();

// The district's own names travel with every row, so the website never has to
// make a second request to label an office. `updated_by` and the soft-delete
// stamp stay internal.
const SELECT = `
  SELECT o.id, o.district_id, d.name_mr AS district_mr, d.name_en AS district_en,
         o.office_name_mr, o.office_name_en,
         o.collector_name, o.collector_designation,
         o.address, o.phone, o.email, o.hours, o.website_url, o.map_url,
         o.is_active, o.created_at, o.updated_at
    FROM district_offices o
    JOIN districts d ON d.id = o.district_id`;

const idSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "A positive record ID is required")
  .refine((v) => Number.isSafeInteger(Number(v)), "A positive record ID is required")
  .transform(Number);

function parseId(value) {
  const parsed = idSchema.safeParse(String(value ?? ""));
  if (!parsed.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  return parsed.data;
}

function parseBody(body) {
  const parsed = officeSchema.safeParse(body);
  if (!parsed.success) {
    throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

// The district has to be a real one, and it may hold only one live office.
// `exceptId` lets an update keep its own district without colliding with
// itself.
async function assertDistrictFree(districtId, exceptId = null) {
  const district = await resolveById("districts", districtId);
  if (!district) throw validation([{ field: "district_id", message: "That district no longer exists" }]);

  const clash = await queryOne(
    `SELECT id FROM district_offices
      WHERE district_id = $1 AND deleted_at IS NULL AND ($2::int IS NULL OR id <> $2)`,
    [districtId, exceptId]
  );
  if (clash) {
    throw conflict(`${district.name_mr} already has an office record`, "district_id");
  }
  return district;
}

const VALUES = (d) => [
  d.district_id, d.office_name_mr, d.office_name_en,
  d.collector_name, d.collector_designation, d.address,
  d.phone, d.email, d.hours, d.website_url, d.map_url, d.is_active,
];

// ── Public ──────────────────────────────────────────────────────────────────

// One district's office, by the master id the site already resolves for its
// dropdowns. An inactive office is not served: deactivating is how an editor
// takes details off the site without deleting what they typed.
router.get(
  "/public/:districtId",
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      `${SELECT} WHERE o.district_id = $1 AND o.is_active = TRUE AND o.deleted_at IS NULL`,
      [parseId(req.params.districtId)]
    );
    if (!row) throw notFound("District office");
    return success(res, row);
  })
);

// Every published office. Lets a page show which districts have one without a
// request each.
router.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `${SELECT} WHERE o.is_active = TRUE AND o.deleted_at IS NULL ORDER BY d.name_mr`
    );
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
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
    const offset = (page - 1) * pageSize;
    const search = String(req.query.search || "").trim();
    const trash = req.query.trash === "true";

    const conditions = [trash ? "o.deleted_at IS NOT NULL" : "o.deleted_at IS NULL"];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(d.name_mr ILIKE $${params.length} OR d.name_en ILIKE $${params.length}
          OR o.office_name_mr ILIKE $${params.length} OR o.collector_name ILIKE $${params.length})`
      );
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [{ count }] = await query(
      `SELECT COUNT(*) AS count FROM district_offices o JOIN districts d ON d.id = o.district_id ${where}`,
      params
    );

    params.push(pageSize, offset);
    const rows = await query(
      `${SELECT} ${where} ORDER BY d.name_mr
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
    const row = await queryOne(`${SELECT} WHERE o.id = $1 AND o.deleted_at IS NULL`, [parseId(req.params.id)]);
    if (!row) throw notFound("District office");
    return success(res, row);
  })
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const d = parseBody(req.body);
    await assertDistrictFree(d.district_id);

    const [created] = await query(
      `INSERT INTO district_offices
         (district_id, office_name_mr, office_name_en, collector_name,
          collector_designation, address, phone, email, hours,
          website_url, map_url, is_active, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [...VALUES(d), req.user.id]
    );
    const row = await queryOne(`${SELECT} WHERE o.id = $1`, [created.id]);
    return success(res, row, 201);
  })
);

router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await queryOne(
      `SELECT id FROM district_offices WHERE id = $1 AND deleted_at IS NULL`, [id]
    );
    if (!existing) throw notFound("District office");

    const d = parseBody(req.body);
    await assertDistrictFree(d.district_id, id);

    await query(
      `UPDATE district_offices SET
         district_id=$1, office_name_mr=$2, office_name_en=$3, collector_name=$4,
         collector_designation=$5, address=$6, phone=$7, email=$8, hours=$9,
         website_url=$10, map_url=$11, is_active=$12, updated_by=$13, updated_at=NOW()
       WHERE id=$14`,
      [...VALUES(d), req.user.id, id]
    );
    const row = await queryOne(`${SELECT} WHERE o.id = $1`, [id]);
    return success(res, row);
  })
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE district_offices SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("District office");
    return success(res, { id: row.id, deleted: true });
  })
);

router.post(
  "/:id/restore",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const trashed = await queryOne(
      `SELECT district_id FROM district_offices WHERE id = $1 AND deleted_at IS NOT NULL`, [id]
    );
    if (!trashed) throw notFound("District office");
    // The district may have gained an office while this one was in the trash.
    await assertDistrictFree(trashed.district_id, id);

    const [row] = await query(
      `UPDATE district_offices SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [id]
    );
    return success(res, { id: row.id, restored: true });
  })
);

export default router;
