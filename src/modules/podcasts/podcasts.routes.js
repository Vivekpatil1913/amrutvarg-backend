import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler, notFound, success, paginated, validation,
} from "../../lib/errors.js";
import { audioProvider } from "../../lib/mediaUrl.js";
import { podcastSchema, PODCAST_CATEGORIES } from "./podcasts.schema.js";

const router = Router();

// As with videos: media ids and disk paths stay out of public responses.
const PUBLIC_COLUMNS = `id, title_mr, title_en, desc_mr, desc_en, source_type,
  media_url, external_url, provider, cover_url, category, duration_seconds,
  publish_date, display_order, created_at`;

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
  const parsed = podcastSchema.safeParse(body);
  if (!parsed.success) {
    throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

const providerFor = (d) => (d.source_type === "upload" ? "file" : audioProvider(d.external_url));

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.limit || "12")));
    const offset = (page - 1) * pageSize;
    const category = String(req.query.category || "");
    const search = String(req.query.search || "").trim().slice(0, 100);

    const conditions = ["published = TRUE", "deleted_at IS NULL"];
    const params = [];

    if (PODCAST_CATEGORIES.includes(category)) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(title_mr ILIKE $${params.length} OR title_en ILIKE $${params.length}
          OR desc_mr ILIKE $${params.length} OR desc_en ILIKE $${params.length})`
      );
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [{ count }] = await query(`SELECT COUNT(*) AS count FROM podcasts ${where}`, params);

    params.push(pageSize, offset);
    const rows = await query(
      // Newest episode first, with the manual order able to pin one above it.
      `SELECT ${PUBLIC_COLUMNS} FROM podcasts ${where}
       ORDER BY display_order ASC, publish_date DESC NULLS LAST, created_at DESC
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
      `SELECT ${PUBLIC_COLUMNS} FROM podcasts
       WHERE id = $1 AND published = TRUE AND deleted_at IS NULL`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("Podcast");
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
    const category = String(req.query.category || "");
    const published = req.query.published;
    const trash = req.query.trash === "true";

    const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(title_mr ILIKE $${params.length} OR title_en ILIKE $${params.length})`);
    }
    if (PODCAST_CATEGORIES.includes(category)) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (published === "true" || published === "false") {
      params.push(published === "true");
      conditions.push(`published = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [{ count }] = await query(`SELECT COUNT(*) AS count FROM podcasts ${where}`, params);

    params.push(pageSize, offset);
    const rows = await query(
      `SELECT * FROM podcasts ${where}
       ORDER BY display_order ASC, publish_date DESC NULLS LAST, created_at DESC
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
      `SELECT * FROM podcasts WHERE id = $1 AND deleted_at IS NULL`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("Podcast");
    return success(res, row);
  })
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const d = parseBody(req.body);
    const [row] = await query(
      `INSERT INTO podcasts
         (title_mr, title_en, desc_mr, desc_en, source_type,
          media_id, media_url, external_url, provider,
          cover_id, cover_url, category, duration_seconds,
          publish_date, published, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        d.title_mr, d.title_en, d.desc_mr, d.desc_en, d.source_type,
        d.media_id, d.media_url, d.external_url, providerFor(d),
        d.cover_id, d.cover_url, d.category, d.duration_seconds,
        d.publish_date || null, d.published, d.display_order,
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
    const existing = await queryOne(`SELECT id FROM podcasts WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!existing) throw notFound("Podcast");

    const d = parseBody(req.body);
    const [row] = await query(
      `UPDATE podcasts SET
         title_mr=$1, title_en=$2, desc_mr=$3, desc_en=$4, source_type=$5,
         media_id=$6, media_url=$7, external_url=$8, provider=$9,
         cover_id=$10, cover_url=$11, category=$12, duration_seconds=$13,
         publish_date=$14, published=$15, display_order=$16, updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [
        d.title_mr, d.title_en, d.desc_mr, d.desc_en, d.source_type,
        d.media_id, d.media_url, d.external_url, providerFor(d),
        d.cover_id, d.cover_url, d.category, d.duration_seconds,
        d.publish_date || null, d.published, d.display_order, id,
      ]
    );
    return success(res, row);
  })
);

router.patch(
  "/:id/publish",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const parsed = z.object({ published: z.boolean() }).safeParse(req.body);
    if (!parsed.success) throw validation([{ field: "published", message: "A true or false value is required" }]);

    const [row] = await query(
      `UPDATE podcasts SET published = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, published`,
      [parsed.data.published, id]
    );
    if (!row) throw notFound("Podcast");
    return success(res, row);
  })
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE podcasts SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("Podcast");
    return success(res, { id: row.id, deleted: true });
  })
);

router.post(
  "/:id/restore",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE podcasts SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
      [parseId(req.params.id)]
    );
    if (!row) throw notFound("Podcast");
    return success(res, { id: row.id, restored: true });
  })
);

export default router;
