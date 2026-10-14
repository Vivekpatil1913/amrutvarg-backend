import { Router } from "express";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success, validation, notFound } from "../../lib/errors.js";
import {
  DEFAULT_VARGS_SECTION,
  STAT_SOURCES,
  STAT_ICONS,
  ORDER_SOURCES,
} from "./section.defaults.js";
import { parseVargsSection, issuesOf } from "./section.schema.js";

const router = Router();

// Created on first access, so a fresh database serves the site's existing copy
// without a separate seed step.
async function ensureRow() {
  await query(
    `INSERT INTO vargs_section (id, draft, published, published_at)
     VALUES (1, $1::jsonb, $1::jsonb, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_VARGS_SECTION)]
  );
  return queryOne(`SELECT * FROM vargs_section WHERE id = 1`);
}

const withDefaults = (value) =>
  value && Object.keys(value).length ? value : DEFAULT_VARGS_SECTION;

// Every number the statistics strip can show, counted in one round trip.
//
// The district and division figures come from the masters, which is what makes
// "36 districts" follow the master rather than a list compiled by hand; the
// `listed_*` pair counts only the geography that actually has a varg.
async function liveCounts() {
  const [row] = await query(
    `SELECT
       (SELECT COUNT(*) FROM vargs
         WHERE is_active = TRUE AND deleted_at IS NULL)::int AS vargs_count,
       (SELECT COUNT(*) FROM districts
         WHERE is_active = TRUE AND deleted_at IS NULL)::int AS districts_count,
       (SELECT COUNT(*) FROM vibhags
         WHERE is_active = TRUE AND deleted_at IS NULL)::int AS divisions_count,
       (SELECT COUNT(DISTINCT district_mr) FROM vargs
         WHERE is_active = TRUE AND deleted_at IS NULL AND district_mr <> '')::int
         AS listed_districts_count,
       (SELECT COUNT(DISTINCT vibhag_mr) FROM vargs
         WHERE is_active = TRUE AND deleted_at IS NULL AND vibhag_mr <> '')::int
         AS listed_divisions_count`
  );
  return {
    vargs_count: row?.vargs_count ?? 0,
    districts_count: row?.districts_count ?? 0,
    divisions_count: row?.divisions_count ?? 0,
    listed_districts_count: row?.listed_districts_count ?? 0,
    listed_divisions_count: row?.listed_divisions_count ?? 0,
  };
}

// Shapes the stored config for the public site: resolves each statistic's
// number, drops the blocks an editor has switched off, and leaves the records
// themselves to /public/vargs.
async function toPublic(config) {
  const counts = await liveCounts();
  const stats = config.stats ?? {};

  return {
    text: config.text ?? {},
    stats:
      stats.enabled === false
        ? null
        : {
            items: (stats.items ?? []).map((s) => ({
              key: s.key,
              icon: s.icon,
              label_mr: s.label_mr,
              label_en: s.label_en,
              source: s.source,
              value: s.source === "manual" ? s.manual_value ?? 0 : counts[s.source] ?? 0,
            })),
          },
    atlas: config.atlas?.enabled === false ? null : config.atlas ?? null,
    search: config.search?.enabled === false ? null : config.search ?? null,
    card: config.card ?? {},
    list: config.list ?? {},
    counts,
  };
}

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return success(res, await toPublic(withDefaults(row?.published)));
  })
);

// ── Admin ────────────────────────────────────────────────────────────────────

// The allowlists the editor builds its pickers from, so the two sides cannot
// disagree about what is valid, plus the live numbers so the form can preview
// what each counted statistic will show.
router.get(
  "/options",
  requireAdmin,
  asyncHandler(async (req, res) =>
    success(res, {
      stat_sources: STAT_SOURCES,
      stat_icons: STAT_ICONS,
      order_sources: ORDER_SOURCES,
      counts: await liveCounts(),
    })
  )
);

router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    const draft = withDefaults(row.draft);
    const published = withDefaults(row.published);
    return success(res, {
      draft,
      published,
      published_at: row.published_at,
      updated_at: row.updated_at,
      has_unpublished_changes: JSON.stringify(draft) !== JSON.stringify(published),
    });
  })
);

router.put(
  "/draft",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = parseVargsSection(req.body);
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    await ensureRow();
    const [row] = await query(
      `UPDATE vargs_section
         SET draft = $1::jsonb, updated_at = NOW(), updated_by = $2
       WHERE id = 1
       RETURNING draft, published, published_at, updated_at`,
      [JSON.stringify(parsed.data), req.user.id]
    );
    return success(res, { ...row, has_unpublished_changes: true });
  })
);

router.post(
  "/publish",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await ensureRow();
    // Re-validated at publish time: the rules may have tightened since the
    // draft was saved, and nothing invalid should reach the site.
    const current = await queryOne(`SELECT draft FROM vargs_section WHERE id = 1`);
    const parsed = parseVargsSection(withDefaults(current?.draft));
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    const row = await transaction(async (tx) => {
      const [updated] = await tx.query(
        `UPDATE vargs_section
           SET published = draft, published_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = 1
         RETURNING draft, published, published_at, updated_at`,
        [req.user.id]
      );
      return updated;
    });

    console.log(`[vargs-section] published by ${req.user.email} (user ${req.user.id}) at ${row.published_at}`);
    return success(res, { ...row, has_unpublished_changes: false });
  })
);

// Throws the working copy away and starts again from what the site is serving.
router.post(
  "/discard",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    if (!row) throw notFound("Amrut Varg section");
    const [updated] = await query(
      `UPDATE vargs_section SET draft = published, updated_at = NOW(), updated_by = $1
       WHERE id = 1
       RETURNING draft, published, published_at, updated_at`,
      [req.user.id]
    );
    return success(res, { ...updated, has_unpublished_changes: false });
  })
);

export default router;
