import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { asyncHandler, success, validation, notFound } from "../../lib/errors.js";
import { FORM_KEYS, FORM_META, DEFAULT_CONFIGS } from "./forms.defaults.js";

const router = Router();

// Presentation text only. No field, validation rule or endpoint is configurable
// here by design — see forms.defaults.js.
const text = (max) => z.string().trim().max(max).default("");

const configSchema = z.object({
  title_mr: z.string().trim().min(1, "Marathi title is required").max(120),
  title_en: text(120),
  intro_mr: text(600),
  intro_en: text(600),
  submit_label_mr: text(60),
  submit_label_en: text(60),
  success_title_mr: text(120),
  success_title_en: text(120),
  success_desc_mr: text(400),
  success_desc_en: text(400),
  is_active: z.boolean().default(true),
  closed_message_mr: text(300),
  closed_message_en: text(300),
});

function assertKey(key) {
  if (!FORM_KEYS.includes(key)) throw notFound("Form");
}

// Rows are created on first access so a fresh database serves the site's
// existing wording without a separate seed step.
async function ensureRows() {
  for (const key of FORM_KEYS) {
    await query(
      `INSERT INTO form_configs (form_key, draft, published, published_at)
       VALUES ($1, $2::jsonb, $2::jsonb, NOW())
       ON CONFLICT (form_key) DO NOTHING`,
      [key, JSON.stringify(DEFAULT_CONFIGS[key])]
    );
  }
}

const withDefaults = (key, value) =>
  value && Object.keys(value).length ? value : DEFAULT_CONFIGS[key];

// ── Public ──────────────────────────────────────────────────────────────────

// Published configuration for every form, keyed by form. Administrative
// metadata (draft, timestamps, editor) is never included.
router.get(
  "/public",
  asyncHandler(async (req, res) => {
    await ensureRows();
    const rows = await query(`SELECT form_key, published FROM form_configs`);
    const map = {};
    for (const row of rows) map[row.form_key] = withDefaults(row.form_key, row.published);
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return success(res, map);
  })
);

// ── Admin ────────────────────────────────────────────────────────────────────

router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await ensureRows();
    const rows = await query(`SELECT * FROM form_configs`);
    const byKey = Object.fromEntries(rows.map((r) => [r.form_key, r]));

    return success(
      res,
      FORM_KEYS.map((key) => {
        const row = byKey[key] ?? {};
        const draft = withDefaults(key, row.draft);
        const published = withDefaults(key, row.published);
        return {
          ...FORM_META[key],
          draft,
          published,
          published_at: row.published_at ?? null,
          updated_at: row.updated_at ?? null,
          has_unpublished_changes: JSON.stringify(draft) !== JSON.stringify(published),
        };
      })
    );
  })
);

router.put(
  "/:key/draft",
  requireAdmin,
  asyncHandler(async (req, res) => {
    assertKey(req.params.key);
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }

    await ensureRows();
    const [row] = await query(
      `UPDATE form_configs SET draft = $1::jsonb, updated_at = NOW(), updated_by = $2
       WHERE form_key = $3
       RETURNING form_key, draft, published, published_at, updated_at`,
      [JSON.stringify(parsed.data), req.user.id, req.params.key]
    );
    return success(res, { ...row, has_unpublished_changes: true });
  })
);

router.post(
  "/:key/publish",
  requireAdmin,
  asyncHandler(async (req, res) => {
    assertKey(req.params.key);
    await ensureRows();

    // Re-validated at publish time: rules may have tightened since the draft
    // was saved, and nothing invalid should reach the public site.
    const current = await queryOne(`SELECT draft FROM form_configs WHERE form_key = $1`, [req.params.key]);
    const parsed = configSchema.safeParse(withDefaults(req.params.key, current?.draft));
    if (!parsed.success) {
      throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }

    const row = await transaction(async (tx) => {
      const [updated] = await tx.query(
        `UPDATE form_configs
           SET published = draft, published_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE form_key = $2
         RETURNING form_key, draft, published, published_at, updated_at`,
        [req.user.id, req.params.key]
      );
      return updated;
    });

    console.log(`[forms] "${req.params.key}" config published by ${req.user.email} (user ${req.user.id})`);
    return success(res, { ...row, has_unpublished_changes: false });
  })
);

router.post(
  "/:key/discard",
  requireAdmin,
  asyncHandler(async (req, res) => {
    assertKey(req.params.key);
    await ensureRows();
    const [row] = await query(
      `UPDATE form_configs SET draft = published, updated_at = NOW(), updated_by = $1
       WHERE form_key = $2
       RETURNING form_key, draft, published, published_at, updated_at`,
      [req.user.id, req.params.key]
    );
    return success(res, { ...row, has_unpublished_changes: false });
  })
);

// Used by the submission endpoints to refuse a form an administrator closed,
// so a hidden button cannot be worked around from the browser.
export async function isFormActive(key) {
  const row = await queryOne(`SELECT published FROM form_configs WHERE form_key = $1`, [key]);
  if (!row) return DEFAULT_CONFIGS[key]?.is_active !== false;
  return withDefaults(key, row.published).is_active !== false;
}

export default router;
