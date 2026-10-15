import { Router } from "express";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success, validation, notFound } from "../../lib/errors.js";
import { DEFAULT_FOOTER, PLATFORMS, SOCIAL_ICONS, LINK_ICONS } from "./footer.defaults.js";
import { parseFooter, issuesOf } from "./footer.schema.js";

const router = Router();

// Created on first access, so a fresh database serves the site's existing copy
// without a separate seed step.
async function ensureRow() {
  await query(
    `INSERT INTO footer_section (id, draft, published, published_at)
     VALUES (1, $1::jsonb, $1::jsonb, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_FOOTER)]
  );
  return queryOne(`SELECT * FROM footer_section WHERE id = 1`);
}

const withDefaults = (value) =>
  value && Object.keys(value).length ? value : DEFAULT_FOOTER;

// Shapes the stored config for the public site: drops disabled rows and the
// admin-only flag. A social profile with no address is dropped too — an icon
// linking nowhere is worse than no icon, and leaving the row in would make the
// site decide something the admin already decided by leaving it blank.
function toPublic(config) {
  const strip = ({ enabled: _e, ...rest }) => rest;
  return {
    text: config.text ?? {},
    links: (config.links ?? []).filter((l) => l.enabled !== false && l.url).map(strip),
    social: (config.social ?? []).filter((s) => s.enabled !== false && s.url).map(strip),
  };
}

// ── Public ──────────────────────────────────────────────────────────────────

router.get(
  "/public",
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    res.set("Cache-Control", "no-store");
    return success(res, toPublic(withDefaults(row?.published)));
  })
);

// ── Admin ────────────────────────────────────────────────────────────────────

// Field allowlists the editor builds its pickers from, so the two sides cannot
// disagree about what is valid.
router.get(
  "/options",
  requireAdmin,
  asyncHandler(async (req, res) => success(res, {
    platforms: PLATFORMS,
    icons: LINK_ICONS,
    socialIcons: SOCIAL_ICONS,
  }))
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
    const parsed = parseFooter(req.body);
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    await ensureRow();
    const [row] = await query(
      `UPDATE footer_section
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
    const current = await queryOne(`SELECT draft FROM footer_section WHERE id = 1`);
    const parsed = parseFooter(withDefaults(current?.draft));
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    const row = await transaction(async (tx) => {
      const [updated] = await tx.query(
        `UPDATE footer_section
           SET published = draft, published_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = 1
         RETURNING draft, published, published_at, updated_at`,
        [req.user.id]
      );
      return updated;
    });

    console.log(`[footer] published by ${req.user.email} (user ${req.user.id}) at ${row.published_at}`);
    return success(res, { ...row, has_unpublished_changes: false });
  })
);

// Throws the working copy away and starts again from what the site is serving.
router.post(
  "/discard",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    if (!row) throw notFound("Footer section");
    const [updated] = await query(
      `UPDATE footer_section SET draft = published, updated_at = NOW(), updated_by = $1
       WHERE id = 1
       RETURNING draft, published, published_at, updated_at`,
      [req.user.id]
    );
    return success(res, { ...updated, has_unpublished_changes: false });
  })
);

export default router;
