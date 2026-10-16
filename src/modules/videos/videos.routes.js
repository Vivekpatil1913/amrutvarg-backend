import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler, notFound, success, paginated, validation,
} from "../../lib/errors.js";
import { videoProvider } from "../../lib/mediaUrl.js";
import { videoSchema, CONTENT_TYPES, VIDEO_CATEGORIES } from "./videos.schema.js";

const router = Router();

// Columns the website is allowed to see. `media_id` and `thumbnail_id` are
// internal bookkeeping and the media table's `path` column is a location on
// disk — none of them belong in a public response.
// Qualified with `v.` because the public queries join the school in. The
// school NAME travels with the row, so the website never needs a second
// request to label a success story; the school id itself stays internal.
const PUBLIC_COLUMNS = `v.id, v.title_mr, v.title_en, v.desc_mr, v.desc_en, v.content_type,
  v.source_type, v.media_url, v.external_url, v.provider, v.thumbnail_url, v.category,
  v.duration_seconds, v.display_order, v.created_at,
  g.school_name AS school_name, g.district_mr AS school_district`;

const PUBLIC_FROM = `FROM videos v LEFT JOIN vargs g ON g.id = v.varg_id AND g.deleted_at IS NULL`;

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
  const parsed = videoSchema.safeParse(body);
  if (!parsed.success) {
    throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

// The provider is decided by the server, not sent by the client: it is what
// the public page keys its rendering off, so it has to agree with the URL
// actually stored.
const providerFor = (d) => (d.source_type === "upload" ? "file" : videoProvider(d.external_url));

// The school a video is linked to has to be a live record. Checked here so
// the message lands on the School field; the error handler still catches a
// foreign-key violation if one slips past.
async function assertSchoolExists(vargId) {
  if (vargId === null || vargId === undefined) return;
  const row = await queryOne(
    `SELECT id FROM vargs WHERE id = $1 AND deleted_at IS NULL`,
    [vargId]
  );
  if (!row) throw validation([{ field: "varg_id", message: "That school no longer exists" }]);
}

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.limit || "12")));
    const offset = (page - 1) * pageSize;
    const type = String(req.query.type || "");
    const category = String(req.query.category || "");
    const search = String(req.query.search || "").trim().slice(0, 100);

    // Draft rows are excluded here, not filtered later: an unpublished video is
    // never part of the result set a public caller can page through.
    //
    // Every column is qualified because this query joins vargs, and the two
    // tables share deleted_at, id, display_order and created_at. An
    // unqualified name would be ambiguous and the query would simply fail.
    const conditions = ["v.published = TRUE", "v.deleted_at IS NULL"];
    const params = [];

    if (CONTENT_TYPES.includes(type)) {
      params.push(type);
      conditions.push(`v.content_type = $${params.length}`);
    }
    if (VIDEO_CATEGORIES.includes(category)) {
      params.push(category);
      conditions.push(`v.category = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(v.title_mr ILIKE $${params.length} OR v.title_en ILIKE $${params.length}
          OR v.desc_mr ILIKE $${params.length} OR v.desc_en ILIKE $${params.length}
          OR g.school_name ILIKE $${params.length})`
      );
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [{ count }] = await query(`SELECT COUNT(*) AS count ${PUBLIC_FROM} ${where}`, params);

    params.push(pageSize, offset);
    const rows = await query(
      `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_FROM} ${where}
       ORDER BY v.display_order ASC, v.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return paginated(res, rows, parseInt(count), page, pageSize);
  })
);

router.get(
  "/public/:id",
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_FROM}
       WHERE v.id = $1 AND v.published = TRUE AND v.deleted_at IS NULL`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("Video");
    return success(res, row);
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
    const type = String(req.query.type || "");
    const category = String(req.query.category || "");
    const published = req.query.published;
    const trash = req.query.trash === "true";

    const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(title_mr ILIKE $${params.length} OR title_en ILIKE $${params.length})`);
    }
    if (CONTENT_TYPES.includes(type)) {
      params.push(type);
      conditions.push(`content_type = $${params.length}`);
    }
    if (VIDEO_CATEGORIES.includes(category)) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (published === "true" || published === "false") {
      params.push(published === "true");
      conditions.push(`published = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [{ count }] = await query(`SELECT COUNT(*) AS count FROM videos ${where}`, params);

    params.push(pageSize, offset);
    const rows = await query(
      `SELECT * FROM videos ${where}
       ORDER BY display_order ASC, created_at DESC
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
      `SELECT * FROM videos WHERE id = $1 AND deleted_at IS NULL`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("Video");
    return success(res, row);
  })
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const d = parseBody(req.body);
    await assertSchoolExists(d.varg_id);
    const [row] = await query(
      `INSERT INTO videos
         (title_mr, title_en, desc_mr, desc_en, content_type, source_type,
          media_id, media_url, external_url, provider,
          thumbnail_id, thumbnail_url, category, duration_seconds,
          published, display_order, varg_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        d.title_mr, d.title_en, d.desc_mr, d.desc_en, d.content_type, d.source_type,
        d.media_id, d.media_url, d.external_url, providerFor(d),
        d.thumbnail_id, d.thumbnail_url, d.category, d.duration_seconds,
        d.published, d.display_order, d.varg_id ?? null,
      ]
    );
    return success(res, row, 201);
  })
);

router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await queryOne(`SELECT id FROM videos WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!existing) throw notFound("Video");

    const d = parseBody(req.body);
    await assertSchoolExists(d.varg_id);
    const [row] = await query(
      `UPDATE videos SET
         title_mr=$1, title_en=$2, desc_mr=$3, desc_en=$4,
         content_type=$5, source_type=$6, media_id=$7, media_url=$8,
         external_url=$9, provider=$10, thumbnail_id=$11, thumbnail_url=$12,
         category=$13, duration_seconds=$14, published=$15, display_order=$16,
         varg_id=$17, updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [
        d.title_mr, d.title_en, d.desc_mr, d.desc_en, d.content_type, d.source_type,
        d.media_id, d.media_url, d.external_url, providerFor(d),
        d.thumbnail_id, d.thumbnail_url, d.category, d.duration_seconds,
        d.published, d.display_order, d.varg_id ?? null, id,
      ]
    );
    return success(res, row);
  })
);

// Publish and unpublish are their own endpoint so the list can flip a row
// without re-sending — and so re-validating — the whole record.
router.patch(
  "/:id/publish",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const parsed = z.object({ published: z.boolean() }).safeParse(req.body);
    if (!parsed.success) throw validation([{ field: "published", message: "A true or false value is required" }]);

    const [row] = await query(
      `UPDATE videos SET published = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, published`,
      [parsed.data.published, id]
    );
    if (!row) throw notFound("Video");
    return success(res, row);
  })
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE videos SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("Video");
    return success(res, { id: row.id, deleted: true });
  })
);

router.post(
  "/:id/restore",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE videos SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("Video");
    return success(res, { id: row.id, restored: true });
  })
);

export default router;
