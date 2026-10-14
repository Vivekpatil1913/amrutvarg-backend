import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { uploadPhoto } from "../../middleware/upload.js";
import {
  asyncHandler, notFound, success, paginated, validation, AppError,
} from "../../lib/errors.js";
import path from "path";
import { env } from "../../config/env.js";
import { isFormActive } from "../forms/forms.routes.js";
import { participantSchema, organizerSchema, leaderSchema } from "../forms/submission.schema.js";

const router = Router();

const FORM_TYPES = ["participant", "organizer", "leader"];
const STATUSES = ["new", "reviewed", "actioned", "archived"];

// ── Public submission endpoints ──────────────────────────────────────────────
//
// Payload shape, stored columns and responses are unchanged. Each endpoint now
// also refuses submissions while an administrator has the form closed, and
// checks the data against the same rules the browser applies — previously these
// routes accepted any JSON object.

// Refuses a closed form from the server, so hiding the trigger in the UI is not
// the only thing standing between a visitor and a submission.
async function assertOpen(formKey) {
  if (!(await isFormActive(formKey))) {
    throw new AppError("FORM_CLOSED", "This form is not accepting submissions at the moment", 403);
  }
}

function check(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw validation(
      parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    );
  }
  // The visitor's payload is stored as sent; the parse is a gate, not a rewrite.
  return data;
}

router.post("/participants", asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object") throw new AppError("VALIDATION_ERROR", "Invalid form data", 422);
  await assertOpen("participant");
  const data = check(participantSchema, req.body);

  const [row] = await query(
    `INSERT INTO form_submissions (form_type, data) VALUES ('participant', $1) RETURNING id, submitted_at`,
    [JSON.stringify(data)]
  );
  return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
}));

router.post("/organizers", asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object") throw new AppError("VALIDATION_ERROR", "Invalid form data", 422);
  await assertOpen("organizer");
  const data = check(organizerSchema, req.body);

  const [row] = await query(
    `INSERT INTO form_submissions (form_type, data) VALUES ('organizer', $1) RETURNING id, submitted_at`,
    [JSON.stringify(data)]
  );
  return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
}));

router.post(
  "/leaders",
  uploadPhoto.single("photo"),
  asyncHandler(async (req, res) => {
    await assertOpen("leader");
    const data = check(leaderSchema, { ...req.body });
    const files = [];

    if (req.file) {
      files.push({
        field: "photo",
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        url: `/uploads/photos/${req.file.filename}`,
      });
    }

    const [row] = await query(
      `INSERT INTO form_submissions (form_type, data, files) VALUES ('leader', $1, $2) RETURNING id, submitted_at`,
      [JSON.stringify(data), JSON.stringify(files)]
    );
    return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
  })
);

// ── Admin endpoints ──────────────────────────────────────────────────────────

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit || "25")));
  const formType = req.query.form_type || "";
  const status = req.query.status || "";
  const search = (req.query.search || "").trim();
  const offset = (page - 1) * pageSize;

  const trash = req.query.trash === "true";

  const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
  const params = [];

  if (formType && FORM_TYPES.includes(formType)) {
    params.push(formType);
    conditions.push(`form_type = $${params.length}`);
  }
  if (status && STATUSES.includes(status)) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`data::text ILIKE $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [{ count }] = await query(`SELECT COUNT(*) AS count FROM form_submissions ${where}`, params);

  params.push(pageSize, offset);
  const rows = await query(
    `SELECT id, form_type, status, notes,
            -- the leader form names its field leaderName, so 'name' alone left
            -- every leader row blank in the list
            COALESCE(data->>'name', data->>'leaderName') AS submitter_name,
            submitted_at, updated_at
     FROM form_submissions ${where}
     ORDER BY submitted_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return paginated(res, rows, parseInt(count), page, pageSize);
}));

router.get("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT * FROM form_submissions WHERE id = $1`,
    [req.params.id]
  );
  if (!row) throw notFound("Submission");
  return success(res, row);
}));

router.put("/:id/status", requireAdmin, asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  if (!STATUSES.includes(status)) throw validation([{ field: "status", message: `Must be one of: ${STATUSES.join(", ")}` }]);

  const [row] = await query(
    `UPDATE form_submissions SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, notes ?? null, req.params.id]
  );
  if (!row) throw notFound("Submission");
  return success(res, row);
}));

// Soft delete: the record leaves the list but is kept, because a submission is
// somebody's registration and losing one outright is not recoverable.
router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const [row] = await query(
    `UPDATE form_submissions SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [req.params.id]
  );
  if (!row) throw notFound("Submission");
  return success(res, { id: row.id, deleted: true });
}));

router.post("/:id/restore", requireAdmin, asyncHandler(async (req, res) => {
  const [row] = await query(
    `UPDATE form_submissions SET deleted_at = NULL, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
    [req.params.id]
  );
  if (!row) throw notFound("Submission");
  return success(res, { id: row.id, restored: true });
}));

export default router;
