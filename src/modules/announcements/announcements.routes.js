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

const schema = z.object({
  title_mr: z.string().min(1).max(300),
  title_en: z.string().max(300).optional().default(""),
  desc_mr: z.string().max(1000).optional().default(""),
  desc_en: z.string().max(1000).optional().default(""),
  link: z.string().url().optional().nullable(),
  link_label: z.string().max(100).optional().nullable(),
  date: z.string().optional().nullable(),
  until_date: z.string().optional().nullable(),
  status: z.enum(["info", "new", "comingSoon", "urgent"]).optional().default("info"),
  pinned: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  display_order: z.number().int().optional().default(0),
});

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT id, title_mr, title_en, desc_mr, desc_en, link, link_label,
              date, until_date, status, pinned, display_order
       FROM announcements
       WHERE is_active = TRUE AND deleted_at IS NULL
         AND (until_date IS NULL OR until_date >= CURRENT_DATE)
       ORDER BY pinned DESC, display_order ASC, date DESC`
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
    const status = req.query.status || "";
    const trash = req.query.trash === "true";
    const offset = (page - 1) * pageSize;

    const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(title_mr ILIKE $${params.length} OR title_en ILIKE $${params.length})`
      );
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const [{ count }] = await query(
      `SELECT COUNT(*) AS count FROM announcements ${where}`,
      params
    );

    params.push(pageSize, offset);
    const rows = await query(
      `SELECT * FROM announcements ${where}
       ORDER BY pinned DESC, display_order ASC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return paginated(res, rows, parseInt(count), page, pageSize);
  })
);

router.get(
  "/trash",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT * FROM announcements WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
    );
    return success(res, rows);
  })
);

router.get(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      `SELECT * FROM announcements WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) throw notFound("Announcement");
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
      `INSERT INTO announcements
         (title_mr, title_en, desc_mr, desc_en, link, link_label, date, until_date,
          status, pinned, is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        d.title_mr, d.title_en, d.desc_mr, d.desc_en,
        d.link || null, d.link_label || null,
        d.date || null, d.until_date || null,
        d.status, d.pinned, d.is_active, d.display_order,
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
      `SELECT id FROM announcements WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!existing) throw notFound("Announcement");

    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

    const d = parsed.data;
    const [row] = await query(
      `UPDATE announcements SET
         title_mr=$1, title_en=$2, desc_mr=$3, desc_en=$4,
         link=$5, link_label=$6, date=$7, until_date=$8,
         status=$9, pinned=$10, is_active=$11, display_order=$12,
         updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [
        d.title_mr, d.title_en, d.desc_mr, d.desc_en,
        d.link || null, d.link_label || null,
        d.date || null, d.until_date || null,
        d.status, d.pinned, d.is_active, d.display_order,
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
      `UPDATE announcements SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id]
    );
    if (!row) throw notFound("Announcement");
    return success(res, { id: row.id, deleted: true });
  })
);

router.post(
  "/:id/restore",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [row] = await query(
      `UPDATE announcements SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
      [req.params.id]
    );
    if (!row) throw notFound("Announcement");
    return success(res, { id: row.id, restored: true });
  })
);

export default router;
