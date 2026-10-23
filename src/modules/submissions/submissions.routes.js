import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { unlink } from "fs/promises";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { uploadPhoto, hasAllowedImageSignature } from "../../middleware/upload.js";
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
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  form_type: z.union([z.enum(FORM_TYPES), z.literal("")]).optional().default(""),
  status: z.union([z.enum(STATUSES), z.literal("")]).optional().default(""),
  search: z.string().trim().max(100).optional().default(""),
  trash: z.enum(["true", "false"]).optional().default("false"),
});
const idSchema = z.string()
  .regex(/^[1-9]\d*$/, "A positive record ID is required")
  .refine((value) => Number.isSafeInteger(Number(value)), "Record ID is too large")
  .transform(Number);
const publicSubmissionLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many submissions. Please try again later." } },
});

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

async function assertVargExists(vargId) {
  if (vargId === null || vargId === undefined) return;
  const row = await queryOne(
    `SELECT id FROM vargs WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [vargId]
  );
  if (!row) throw validation([{ field: "amrutVargId", message: "Selected Amrut Varg is no longer available" }]);
}

function check(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw validation(
      parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    );
  }
  // Persist only validated, normalized fields. Zod strips unknown keys by
  // default, preventing crafted properties from entering the submissions JSON.
  return parsed.data;
}

router.post("/participants", publicSubmissionLimit, asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object") throw new AppError("VALIDATION_ERROR", "Invalid form data", 422);
  await assertOpen("participant");
  const data = check(participantSchema, req.body);
  await assertVargExists(data.amrutVargId);

  const [row] = await query(
    `INSERT INTO form_submissions (form_type, data) VALUES ('participant', $1) RETURNING id, submitted_at`,
    [JSON.stringify(data)]
  );
  return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
}));

router.post("/organizers", publicSubmissionLimit, asyncHandler(async (req, res) => {
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
  publicSubmissionLimit,
  (req, res, next) => assertOpen("leader").then(() => next()).catch(next),
  uploadPhoto.single("photo"),
  asyncHandler(async (req, res) => {
    let data;
    try {
      data = check(leaderSchema, { ...req.body });
    } catch (error) {
      if (req.file) await unlink(req.file.path).catch(() => {});
      throw error;
    }
    if (req.file && !(await hasAllowedImageSignature(req.file.path, { allowGif: false, expectedMime: req.file.mimetype }))) {
      await unlink(req.file.path).catch(() => {});
      throw new AppError("VALIDATION_ERROR", "Uploaded file content is not a supported image", 422);
    }
    try {
      await assertVargExists(req.body.amrutVargId ? Number(req.body.amrutVargId) : undefined);
    } catch (error) {
      if (req.file) await unlink(req.file.path).catch(() => {});
      throw error;
    }
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

    let row;
    try {
      [row] = await query(
        `INSERT INTO form_submissions (form_type, data, files) VALUES ('leader', $1, $2) RETURNING id, submitted_at`,
        [JSON.stringify(data), JSON.stringify(files)]
      );
    } catch (error) {
      if (req.file) await unlink(req.file.path).catch(() => {});
      throw error;
    }
    return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
  })
);

// ── Admin endpoints ──────────────────────────────────────────────────────────

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const { page, limit: pageSize, form_type: formType, status, search, trash: trashValue } = parsed.data;
  const offset = (page - 1) * pageSize;

  const trash = trashValue === "true";

  const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
  const params = [];

  if (formType) {
    params.push(formType);
    conditions.push(`form_type = $${params.length}`);
  }
  if (status) {
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
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const row = await queryOne(
    `SELECT * FROM form_submissions WHERE id = $1`,
    [parsedId.data]
  );
  if (!row) throw notFound("Submission");
  return success(res, row);
}));

router.put("/:id/status", requireAdmin, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const bodySchema = z.object({
    status: z.enum(STATUSES),
    notes: z.string().trim().max(2000).optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const { status, notes } = parsed.data;

  const [row] = await query(
    `UPDATE form_submissions SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
     WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
    [status, notes ?? null, parsedId.data]
  );
  if (!row) throw notFound("Submission");
  return success(res, row);
}));

// Soft delete: the record leaves the list but is kept, because a submission is
// somebody's registration and losing one outright is not recoverable.
router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const [row] = await query(
    `UPDATE form_submissions SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [parsedId.data]
  );
  if (!row) throw notFound("Submission");
  return success(res, { id: row.id, deleted: true });
}));

router.post("/:id/restore", requireAdmin, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const [row] = await query(
    `UPDATE form_submissions SET deleted_at = NULL, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
    [parsedId.data]
  );
  if (!row) throw notFound("Submission");
  return success(res, { id: row.id, restored: true });
}));

export default router;
