import { Router } from "express";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success, validation, notFound } from "../../lib/errors.js";
import { DEFAULT_JOIN, ACTIONS } from "./join.defaults.js";
import { ICONS } from "../hero/hero.defaults.js";
import { parseJoin, issuesOf } from "./join.schema.js";

const router = Router();

// Created on first access, so a fresh database serves the site's existing copy
// without a separate seed step.
async function ensureRow() {
  await query(
    `INSERT INTO join_section (id, draft, published, published_at)
     VALUES (1, $1::jsonb, $1::jsonb, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_JOIN)]
  );
  return queryOne(`SELECT * FROM join_section WHERE id = 1`);
}

const withDefaults = (value) =>
  value && Object.keys(value).length ? value : DEFAULT_JOIN;

// Shapes the stored config for the public site: drops disabled cards and the
// admin-only flags. The card number is not sent — the site derives it from
// position, so the two can never disagree.
function toPublic(config) {
  const cards = (config.cards ?? [])
    .filter((c) => c.enabled !== false)
    .map(({ enabled: _e, ...card }) => card);
  return { text: config.text ?? {}, cards };
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
  asyncHandler(async (req, res) => success(res, { icons: ICONS, actions: ACTIONS }))
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
    const parsed = parseJoin(req.body);
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    await ensureRow();
    const [row] = await query(
      `UPDATE join_section
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
    const current = await queryOne(`SELECT draft FROM join_section WHERE id = 1`);
    const parsed = parseJoin(withDefaults(current?.draft));
    if (!parsed.success) throw validation(issuesOf(parsed.error));

    const row = await transaction(async (tx) => {
      const [updated] = await tx.query(
        `UPDATE join_section
           SET published = draft, published_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = 1
         RETURNING draft, published, published_at, updated_at`,
        [req.user.id]
      );
      return updated;
    });

    console.log(`[join] published by ${req.user.email} (user ${req.user.id}) at ${row.published_at}`);
    return success(res, { ...row, has_unpublished_changes: false });
  })
);

// Throws the working copy away and starts again from what the site is serving.
router.post(
  "/discard",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const row = await ensureRow();
    if (!row) throw notFound("Join section");
    const [updated] = await query(
      `UPDATE join_section SET draft = published, updated_at = NOW(), updated_by = $1
       WHERE id = 1
       RETURNING draft, published, published_at, updated_at`,
      [req.user.id]
    );
    return success(res, { ...updated, has_unpublished_changes: false });
  })
);

export default router;
