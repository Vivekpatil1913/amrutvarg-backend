import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  asyncHandler,
  notFound,
  success,
  paginated,
  validation,
} from "../../lib/errors.js";

const router = Router();

const CATEGORIES = [
  "personality", "confidence", "communication", "leadership",
  "creativity", "discipline", "learning", "social",
  "community", "challenges", "habits", "group",
];

const schema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  category: z.enum(CATEGORIES).default("personality"),
  title_mr: z.string().min(1).max(300),
  title_en: z.string().max(300).optional().default(""),
  short_mr: z.string().max(500).optional().default(""),
  short_en: z.string().max(500).optional().default(""),
  image_key: z.string().max(200).optional().nullable(),
  content: z.record(z.any()).optional().default({}),
  featured: z.boolean().optional().default(false),
  published: z.boolean().optional().default(false),
  display_order: z.number().int().optional().default(0),
});

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.limit || "8")));
    const category = req.query.category || "";
    const offset = (page - 1) * pageSize;

    const conditions = ["published = TRUE", "deleted_at IS NULL"];
    const params = [];
    if (category && CATEGORIES.includes(category)) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const [{ count }] = await query(
      `SELECT COUNT(*) AS count FROM stories ${where}`,
      params
    );

    params.push(pageSize, offset);
    const rows = await query(
      `SELECT id, slug, category, title_mr, title_en, short_mr, short_en,
              image_key, featured, display_order
       FROM stories ${where}
       ORDER BY featured DESC, display_order ASC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return paginated(res, rows, parseInt(count), page, pageSize);
  })
);

router.get(
  "/public/:slug",
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      `SELECT * FROM stories WHERE slug = $1 AND published = TRUE AND deleted_at IS NULL`,
      [req.params.slug]
    );
    if (!row) throw notFound("Story");
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
    const search = (req.query.search || "").trim();
    const category = req.query.category || "";
    const published = req.query.published;
    const trash = req.query.trash === "true";
    const offset = (page - 1) * pageSize;

    const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(title_mr ILIKE $${params.length} OR title_en ILIKE $${params.length} OR slug ILIKE $${params.length})`
      );
    }
    if (category && CATEGORIES.includes(category)) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (published === "true" || published === "false") {
      params.push(published === "true");
      conditions.push(`published = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const [{ count }] = await query(
      `SELECT COUNT(*) AS count FROM stories ${where}`,
      params
    );

    params.push(pageSize, offset);
    const rows = await query(
      `SELECT id, slug, category, title_mr, title_en, short_mr, short_en,
              featured, published, display_order, created_at, updated_at
       FROM stories ${where}
       ORDER BY featured DESC, display_order ASC, created_at DESC
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
      `SELECT * FROM stories WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) throw notFound("Story");
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
    const [row] = await query(
      `INSERT INTO stories
         (slug, category, title_mr, title_en, short_mr, short_en,
          image_key, content, featured, published, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        d.slug, d.category, d.title_mr, d.title_en,
        d.short_mr, d.short_en, d.image_key || null,
        JSON.stringify(d.content), d.featured, d.published, d.display_order,
      ]
    );
    return success(res, row, 201);
  })
);

router.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne(
      `SELECT id FROM stories WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!existing) throw notFound("Story");

    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

    const d = parsed.data;
    const [row] = await query(
      `UPDATE stories SET
         slug=$1, category=$2, title_mr=$3, title_en=$4,
         short_mr=$5, short_en=$6, image_key=$7, content=$8,
         featured=$9, published=$10, display_order=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [
        d.slug, d.category, d.title_mr, d.title_en,
        d.short_mr, d.short_en, d.image_key || null,
        JSON.stringify(d.content), d.featured, d.published, d.display_order,
        req.params.id,
      ]
    );
    return success(res, row);
  })
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE stories SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id]
    );
    if (!row) throw notFound("Story");
    return success(res, { id: row.id, deleted: true });
  })
);

router.post(
  "/:id/restore",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE stories SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
      [req.params.id]
    );
    if (!row) throw notFound("Story");
    return success(res, { id: row.id, restored: true });
  })
);

export default router;
