import { Router } from "express";
import { z } from "zod";
import { resolveDistrictTaluka } from "../masters/geo.validate.js";
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

const optionalId = z
  .union([z.number().int().positive(), z.literal(null), z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === undefined ? null : v));
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

  // Event details, for an AMRUT training or similar. Every one is
  // optional: a circular has no venue, and a notice that is not an event
  // simply leaves them empty. `date` doubles as the event date rather
  // than a second date field competing with it.
  event_time: z.string().trim().max(120).optional().default(""),
  venue: z.string().trim().max(300).optional().default(""),
  // The place comes from the masters, not free text: an event cannot be
  // announced in a district the programme does not recognise. Ids are
  // optional so an older client posting names alone still works.
  district: z.string().trim().max(100).optional().default(""),
  district_id: optionalId,
  taluka: z.string().trim().max(100).optional().default(""),
  taluka_id: optionalId,
  notes_mr: z.string().trim().max(1000).optional().default(""),
  notes_en: z.string().trim().max(1000).optional().default(""),
});

// Resolves the event's district and taluka against the masters.
//
// Shares resolveDistrictTaluka with vargs, so a taluka from the wrong
// district is refused here exactly as it is there. Both are optional — most
// notices are not events — but a taluka given without a district, or one
// belonging elsewhere, is an error rather than something to store quietly.
async function resolveEventPlace(d) {
  if (!d.district && !d.district_id && !d.taluka && !d.taluka_id) {
    return { district: "", district_id: null, taluka: "", taluka_id: null };
  }
  const { issues, district, taluka } = await resolveDistrictTaluka(
    {
      districtId: d.district_id,
      districtName: d.district,
      talukaId: d.taluka_id,
      talukaName: d.taluka,
    },
    { district: "district", taluka: "taluka" }
  );
  if (issues.length) throw validation(issues);
  if (!district && d.district) {
    throw validation([{ field: "district", message: `Unknown district "${d.district}"` }]);
  }
  // The names are read back off the resolved rows, so a record's name and
  // its id can never describe different places.
  return {
    district: district ? district.name_mr : "",
    district_id: district?.id ?? null,
    taluka: taluka ? taluka.name_mr : "",
    taluka_id: taluka?.id ?? null,
  };
}

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT id, title_mr, title_en, desc_mr, desc_en, link, link_label,
              date, until_date, status, pinned, display_order,
              event_time, venue, district, taluka, notes_mr, notes_en
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
    const place = await resolveEventPlace(d);
    const [row] = await query(
      `INSERT INTO announcements
         (title_mr, title_en, desc_mr, desc_en, link, link_label, date, until_date,
          status, pinned, is_active, display_order,
          event_time, venue, district, district_id, taluka, taluka_id,
          notes_mr, notes_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        d.title_mr, d.title_en, d.desc_mr, d.desc_en,
        d.link || null, d.link_label || null,
        d.date || null, d.until_date || null,
        d.status, d.pinned, d.is_active, d.display_order,
        d.event_time, d.venue,
        place.district, place.district_id, place.taluka, place.taluka_id,
        d.notes_mr, d.notes_en,
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
    const place = await resolveEventPlace(d);
    const [row] = await query(
      `UPDATE announcements SET
         title_mr=$1, title_en=$2, desc_mr=$3, desc_en=$4,
         link=$5, link_label=$6, date=$7, until_date=$8,
         status=$9, pinned=$10, is_active=$11, display_order=$12,
         event_time=$13, venue=$14,
         district=$15, district_id=$16, taluka=$17, taluka_id=$18,
         notes_mr=$19, notes_en=$20,
         updated_at=NOW()
       WHERE id=$21 RETURNING *`,
      [
        d.title_mr, d.title_en, d.desc_mr, d.desc_en,
        d.link || null, d.link_label || null,
        d.date || null, d.until_date || null,
        d.status, d.pinned, d.is_active, d.display_order,
        d.event_time, d.venue,
        place.district, place.district_id, place.taluka, place.taluka_id,
        d.notes_mr, d.notes_en,
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
