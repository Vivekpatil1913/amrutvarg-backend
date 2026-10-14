import { Router } from "express";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success, validation, notFound } from "../../lib/errors.js";
import { ICONS } from "../hero/hero.defaults.js";
import { DEFAULT_ABOUT } from "./about.defaults.js";
import { parseAbout, issuesOf } from "./about.schema.js";

const router = Router();

// Created on first access, so a fresh database serves the site's existing copy
// without a separate seed step.
async function ensureRow() {
  await query(
    `INSERT INTO about_section (id, draft, published, published_at)
     VALUES (1, $1::jsonb, $1::jsonb, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_ABOUT)]
  );
  return queryOne(`SELECT * FROM about_section WHERE id = 1`);
}

const withDefaults = (value) =>
  value && Object.keys(value).length ? value : DEFAULT_ABOUT;

// Shapes the stored config for the public site: drops disabled entries and the
// admin-only flags, so nothing switched off can leak into the page.
function toPublic(config) {
  const on = (list) => (Array.isArray(list) ? list.filter((i) => i.enabled !== false) : []);
  return {
    text: config.text ?? {},
    image: config.image?.enabled === false ? null : config.image ?? null,
    steps: on(config.steps).map(({ enabled: _e, ...step }) => step),
    features: config.features?.enabled === false
      ? null
      : {
          title_mr: config.features?.title_mr ?? "",
          title_en: config.features?.title_en ?? "",
          icon: config.features?.icon ?? "sparkle",
          items: on(config.features?.items).map(({ enabled: _e, ...f }) => f),
        },
  };
}

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return success(res, toPublic(withDefaults(row?.published)));
  })
);

// ── Admin ────────────────────────────────────────────────────────────────────

// Field allowlists the editor builds its pickers from, so the two sides cannot
// disagree about what is valid.
router.get(
  "/options",
  requireAdmin,
  asyncHandler(async (req, res) => success(res, { icons: ICONS }))
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
    const parsed = parseAbout(req.body);
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    // The image may only point at media the library actually holds, so a draft
    // can never publish a reference to a deleted or foreign file.
    const id = parsed.data.image.media_id;
    if (id !== null) {
      const asset = await queryOne(
        `SELECT id FROM media_assets WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (!asset) throw validation([{ field: "image.media_id", message: "Media asset not found" }]);
    }

    await ensureRow();
    const [row] = await query(
      `UPDATE about_section
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
    // Re-validated at publish time: the rules may have tightened since the draft
    // was saved, and nothing invalid should reach the site.
    const current = await queryOne(`SELECT draft FROM about_section WHERE id = 1`);
    const parsed = parseAbout(withDefaults(current?.draft));
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    const row = await transaction(async (tx) => {
      const [updated] = await tx.query(
        `UPDATE about_section
           SET published = draft, published_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = 1
         RETURNING draft, published, published_at, updated_at`,
        [req.user.id]
      );
      return updated;
    });

    console.log(`[about] published by ${req.user.email} (user ${req.user.id}) at ${row.published_at}`);
    return success(res, { ...row, has_unpublished_changes: false });
  })
);

// Throws the working copy away and starts again from what the site is serving.
router.post(
  "/discard",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    if (!row) throw notFound("About section");
    const [updated] = await query(
      `UPDATE about_section SET draft = published, updated_at = NOW(), updated_by = $1
       WHERE id = 1
       RETURNING draft, published, published_at, updated_at`,
      [req.user.id]
    );
    return success(res, { ...updated, has_unpublished_changes: false });
  })
);

export default router;
