import { Router } from "express";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success, validation, notFound } from "../../lib/errors.js";
import { DEFAULT_HERO, ICONS, TARGETS, STAT_SOURCES } from "./hero.defaults.js";
import { parseHero, issuesOf } from "./hero.schema.js";

const router = Router();

// The single config row is created on first access, so a fresh database serves
// the site's existing content without a separate seed step.
async function ensureRow() {
  await query(
    `INSERT INTO hero_section (id, draft, published, published_at)
     VALUES (1, $1::jsonb, $1::jsonb, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_HERO)]
  );
  return queryOne(`SELECT * FROM hero_section WHERE id = 1`);
}

// Counts the statistics marked as database-driven. One query, not one per card.
async function liveCounts() {
  const [row] = await query(
    `SELECT COUNT(*)::int AS vargs,
            COUNT(DISTINCT vibhag_mr) FILTER (WHERE vibhag_mr <> '')::int AS divisions
     FROM vargs
     WHERE is_active = TRUE AND deleted_at IS NULL`
  );
  return { vargs_count: row?.vargs ?? 0, divisions_count: row?.divisions ?? 0 };
}

// Shapes the stored config for the public site: drops disabled entries, fills
// in counted statistics, and keeps only the fields the page renders.
async function toPublic(config) {
  const counts = await liveCounts();
  const enabled = (list) => (Array.isArray(list) ? list.filter((i) => i.enabled !== false) : []);

  return {
    text: config.text ?? {},
    images: {
      ...config.images,
      main: config.images?.main?.enabled === false ? null : config.images?.main ?? null,
      small: config.images?.small?.enabled === false ? null : config.images?.small ?? null,
    },
    ctas: enabled(config.ctas).map(({ enabled: _e, ...cta }) => cta),
    stats: enabled(config.stats).map(({ enabled: _e, ...stat }) => ({
      ...stat,
      // A counted statistic carries its number; the site localises the digits.
      count: stat.source === "manual" ? null : counts[stat.source] ?? null,
    })),
    quicknav: enabled(config.quicknav).map(({ enabled: _e, ...item }) => item),
    a11y: config.a11y ?? {},
  };
}

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    const published = row?.published && Object.keys(row.published).length ? row.published : DEFAULT_HERO;
    // Content changes rarely and is safe to hold briefly at the edge; a publish
    // moves the row's updated_at, and the short window keeps it near-live.
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return success(res, await toPublic(published));
  })
);

// ── Admin ────────────────────────────────────────────────────────────────────

// Field allowlists the editor builds its icon/destination/source pickers from,
// so the two sides can never disagree about what is valid.
router.get(
  "/options",
  requireAdmin,
  asyncHandler(async (req, res) =>
    success(res, { icons: ICONS, targets: TARGETS, statSources: STAT_SOURCES })
  )
);

router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    const draft = row.draft && Object.keys(row.draft).length ? row.draft : DEFAULT_HERO;
    const published = row.published && Object.keys(row.published).length ? row.published : DEFAULT_HERO;
    return success(res, {
      draft,
      published,
      published_at: row.published_at,
      updated_at: row.updated_at,
      // Lets the editor show "unpublished changes" without diffing in the UI.
      has_unpublished_changes: JSON.stringify(draft) !== JSON.stringify(published),
    });
  })
);

router.put(
  "/draft",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = parseHero(req.body);
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    // Images may only point at media the library actually holds, so a draft can
    // never publish a reference to a deleted or foreign file.
    for (const slot of ["main", "small"]) {
      const id = parsed.data.images[slot].media_id;
      if (id === null) continue;
      const asset = await queryOne(
        `SELECT id FROM media_assets WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (!asset) throw validation([{ field: `images.${slot}.media_id`, message: "Media asset not found" }]);
    }

    await ensureRow();
    const [row] = await query(
      `UPDATE hero_section
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
    // Draft is re-validated at the moment of publishing: the rules may have
    // tightened since it was saved, and nothing invalid should reach the site.
    const current = await queryOne(`SELECT draft FROM hero_section WHERE id = 1`);
    const parsed = parseHero(current.draft);
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    const row = await transaction(async (tx) => {
      const [updated] = await tx.query(
        `UPDATE hero_section
           SET published = draft, published_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = 1
         RETURNING draft, published, published_at, updated_at`,
        [req.user.id]
      );
      return updated;
    });

    console.log(`[hero] published by ${req.user.email} (user ${req.user.id}) at ${row.published_at}`);
    return success(res, { ...row, has_unpublished_changes: false });
  })
);

// Throws the working copy away and starts again from what the site is serving.
router.post(
  "/discard",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    if (!row) throw notFound("Hero section");
    const [updated] = await query(
      `UPDATE hero_section
         SET draft = published, updated_at = NOW(), updated_by = $1
       WHERE id = 1
       RETURNING draft, published, published_at, updated_at`,
      [req.user.id]
    );
    return success(res, { ...updated, has_unpublished_changes: false });
  })
);

export default router;
