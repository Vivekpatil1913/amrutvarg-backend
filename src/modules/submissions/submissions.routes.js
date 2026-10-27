import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { unlink } from "fs/promises";
import { query, queryOne, transaction } from "../../db/pool.js";
import { requireStaff } from "../../middleware/auth.js";
import { uploadPhoto, hasAllowedImageSignature } from "../../middleware/upload.js";
import {
  asyncHandler, notFound, success, paginated, validation, AppError,
} from "../../lib/errors.js";
import path from "path";
import { env } from "../../config/env.js";
import { isFormActive } from "../forms/forms.routes.js";
import { participantSchema, organizerSchema, leaderSchema } from "../forms/submission.schema.js";
import { resolveByName } from "../masters/geo.validate.js";
import { scopeOf, scopeDistrictIds, assertInScope } from "../../lib/scope.js";
import { audit } from "../../lib/audit.js";
import { notify, responsibleFor } from "../notifications/notifications.service.js";

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

// Direct self-service listing. An organiser's registration no longer waits in
// the CMS for approval: the submission and its public Amrut Varg listing are
// written in one transaction, so the listing is live — under its division and
// district — the moment the organiser sees the confirmation. Administrators
// moderate afterwards (vargs.routes.js, POST /:id/moderate).
//
// The district is resolved against the masters, and the division is read off
// the district rather than asked for, so a listing always files under the
// right विभाग.
router.post("/organizers", publicSubmissionLimit, asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object") throw new AppError("VALIDATION_ERROR", "Invalid form data", 422);
  await assertOpen("organizer");
  const data = check(organizerSchema, req.body);

  const district = await resolveByName("districts", data.district);
  if (!district) throw validation([{ field: "district", message: "Choose a valid district" }]);
  const vibhag = await queryOne(`SELECT id, name_mr, name_en FROM vibhags WHERE id = $1`, [district.vibhag_id]);
  if (!vibhag) throw validation([{ field: "district", message: "That district is not assigned to a division" }]);

  const { submission, varg } = await transaction(async (tx) => {
    const submission = await tx.queryOne(
      `INSERT INTO form_submissions (form_type, data, status, notes)
       VALUES ('organizer', $1, 'actioned', 'Published automatically on submission')
       RETURNING id, submitted_at`,
      [JSON.stringify(data)]
    );
    const varg = await tx.queryOne(
      `INSERT INTO vargs
         (vibhag_mr, vibhag_en, district_mr, district_en, district_id,
          school_name, varg_name, coordinator_name,
          is_active, status, source, submission_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'PUBLISHED', 'organizer', $9)
       RETURNING id, vibhag_mr, vibhag_en, district_mr, district_en, district_id,
                 taluka, village, school_name, varg_name, coordinator_name, status`,
      [vibhag.name_mr, vibhag.name_en, district.name_mr, district.name_en, district.id,
       data.organisation, data.branch || "", data.contactPerson, submission.id]
    );
    return { submission, varg };
  });

  // Post-moderation: the officers for that place are told a listing went live
  // so they can review it. After the response, and never fatal.
  responsibleFor({ districtId: district.id, divisionId: vibhag.id })
    .then(({ district: d, division, state }) =>
      notify([...d, ...division, ...state], {
        title: `New Amrut Varg listed: ${varg.school_name}`,
        body: `${varg.district_mr} · self-published by ${data.name}. Review and moderate if needed.`,
        link: `/admin/vargs/${varg.id}`,
        category: "varg",
      }))
    .catch((err) => console.error("Varg listing notice failed:", err.message));
  audit(req, "varg.self_publish", "varg", varg.id, { submission: submission.id, school: varg.school_name, district: varg.district_mr });

  return success(res, { id: submission.id, submitted_at: submission.submitted_at, varg }, 201);
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
//
// Open to all three tiers. A submission stores its place as a district NAME
// (or, for a school student, the id of the varg chosen), so a division or
// district manager sees those whose district name — current or former, in
// either language — is in their jurisdiction, or whose varg is.

async function scopeCondition(user, params) {
  const ids = await scopeDistrictIds(user);
  if (ids === null) return "TRUE";
  if (!ids.length) return "FALSE";
  const names = await query(
    `SELECT ARRAY_REMOVE(ARRAY_AGG(DISTINCT n), NULL) AS names FROM (
       SELECT LOWER(name_mr) AS n FROM districts WHERE id = ANY($1)
       UNION SELECT LOWER(NULLIF(name_en, '')) FROM districts WHERE id = ANY($1)
       UNION SELECT LOWER(UNNEST(former_names)) FROM districts WHERE id = ANY($1)
     ) x`,
    [ids]
  );
  params.push(names[0]?.names ?? []);
  const n = params.length;
  params.push(ids);
  const i = params.length;
  return `(LOWER(TRIM(data->>'district')) = ANY($${n})
           OR (CASE WHEN data->>'amrutVargId' ~ '^[0-9]{1,9}$' THEN (data->>'amrutVargId')::int END)
              IN (SELECT id FROM vargs WHERE district_id = ANY($${i})))`;
}

async function assertSubmissionInScope(user, row) {
  if (scopeOf(user).level === "state") return;
  const params = [row.id];
  const condition = await scopeCondition(user, params);
  const hit = await queryOne(`SELECT id FROM form_submissions WHERE id = $1 AND ${condition}`, params);
  if (!hit) throw notFound("Submission");
}

// A district or division manager registering a student straight into one of
// their own vargs. Same payload and rules as the public participant form; the
// varg is required here, and must be inside the caller's jurisdiction.
router.post("/register-participant", requireStaff, asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object") throw new AppError("VALIDATION_ERROR", "Invalid form data", 422);
  const data = check(participantSchema, req.body);
  if (!data.amrutVargId) throw validation([{ field: "amrutVargId", message: "Choose the Amrut Varg to register the student in" }]);
  const varg = await queryOne(
    `SELECT id, district_id FROM vargs WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [data.amrutVargId]
  );
  if (!varg) throw validation([{ field: "amrutVargId", message: "Selected Amrut Varg is no longer available" }]);
  await assertInScope(req.user, { districtId: varg.district_id }, "You can only register students in your own jurisdiction's vargs");

  const [row] = await query(
    `INSERT INTO form_submissions (form_type, data, status, notes)
     VALUES ('participant', $1, 'reviewed', $2) RETURNING id, submitted_at`,
    [JSON.stringify(data), `Registered by ${req.user.name} (${req.user.role})`]
  );
  await audit(req, "participant.register", "submission", row.id, { varg: varg.id });
  return success(res, { id: row.id, submitted_at: row.submitted_at }, 201);
}));

router.get("/", requireStaff, asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const { page, limit: pageSize, form_type: formType, status, search, trash: trashValue } = parsed.data;
  const offset = (page - 1) * pageSize;

  const trash = trashValue === "true";

  const conditions = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
  const params = [];
  conditions.push(await scopeCondition(req.user, params));

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

router.get("/:id", requireStaff, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const row = await queryOne(
    `SELECT * FROM form_submissions WHERE id = $1`,
    [parsedId.data]
  );
  if (!row) throw notFound("Submission");
  await assertSubmissionInScope(req.user, row);
  return success(res, row);
}));

router.put("/:id/status", requireStaff, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  await assertSubmissionInScope(req.user, { id: parsedId.data });
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
router.delete("/:id", requireStaff, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  await assertSubmissionInScope(req.user, { id: parsedId.data });
  const [row] = await query(
    `UPDATE form_submissions SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [parsedId.data]
  );
  if (!row) throw notFound("Submission");
  return success(res, { id: row.id, deleted: true });
}));

router.post("/:id/restore", requireStaff, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  await assertSubmissionInScope(req.user, { id: parsedId.data });
  const [row] = await query(
    `UPDATE form_submissions SET deleted_at = NULL, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
    [parsedId.data]
  );
  if (!row) throw notFound("Submission");
  return success(res, { id: row.id, restored: true });
}));

export default router;
