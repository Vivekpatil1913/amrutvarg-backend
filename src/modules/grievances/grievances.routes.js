import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import path from "path";
import { unlink } from "fs/promises";
import { query, queryOne, transaction } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { requireStaff } from "../../middleware/auth.js";
import {
  uploadGrievanceMedia, hasAllowedImageSignature, hasAllowedVideoSignature,
} from "../../middleware/upload.js";
import {
  asyncHandler, success, paginated, notFound, validation, AppError,
} from "../../lib/errors.js";
import { scopeSql, assertInScope } from "../../lib/scope.js";
import { audit } from "../../lib/audit.js";
import {
  grievanceSchema, statusUpdateSchema, feedbackSchema, checkTransition,
  ticketNumber, LIMITS, STATUSES, SUBMISSION_TYPES,
} from "./grievances.schema.js";
import { slaSql } from "./grievances.sla.js";
import { alertNewGrievance, notifyComplainantOfClosure } from "./grievances.alerts.js";

const issuesOf = (error) => error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));

const idSchema = z.string()
  .regex(/^[1-9]\d*$/, "A positive record ID is required")
  .refine((v) => Number.isSafeInteger(Number(v)), "Record ID is too large")
  .transform(Number);

function parseId(value) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  return parsed.data;
}

const SLA = slaSql(env.sla, "g");

// ════════════════════════════════════════════════════════════════════════════
// Public
// ════════════════════════════════════════════════════════════════════════════

export const publicRouter = Router();

const submitLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.sla.submitLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many submissions. Please try again later." } },
});

const filesOf = (req) => [...(req.files?.photos ?? []), ...(req.files?.video ?? [])];
const discard = (files) => Promise.all(files.map((f) => unlink(f.path).catch(() => {})));

// Every uploaded file is checked before anything is stored: size per type,
// then the file's own bytes. One bad file rejects the whole submission, and
// every file written for it is removed.
async function checkAttachments(req) {
  const photos = req.files?.photos ?? [];
  const video = req.files?.video?.[0];
  const issues = [];
  for (const p of photos) {
    if (p.size > LIMITS.photoMaxBytes) {
      issues.push({ field: "photos", message: `${p.originalname} is larger than 3 MB` });
    } else if (!(await hasAllowedImageSignature(p.path, { allowGif: false, expectedMime: p.mimetype }))) {
      issues.push({ field: "photos", message: `${p.originalname} is not a valid JPG, PNG or WEBP image` });
    }
  }
  if (video) {
    if (video.size > LIMITS.videoMaxBytes) {
      issues.push({ field: "video", message: "Video is larger than 20 MB" });
    } else if (!(await hasAllowedVideoSignature(video.path, { expectedMime: video.mimetype }))) {
      issues.push({ field: "video", message: "Video is not a valid MP4, MOV or WEBM file" });
    }
  }
  return issues;
}

publicRouter.post(
  "/",
  submitLimit,
  uploadGrievanceMedia,
  asyncHandler(async (req, res) => {
    const files = filesOf(req);
    let data;
    try {
      const parsed = grievanceSchema.safeParse(req.body ?? {});
      const issues = parsed.success ? [] : issuesOf(parsed.error);
      issues.push(...(await checkAttachments(req)));
      if (parsed.success) {
        const district = await queryOne(
          `SELECT id, vibhag_id FROM districts WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
          [parsed.data.district_id]
        );
        if (!district) issues.push({ field: "district_id", message: "Choose a valid district" });
        else if (district.vibhag_id !== parsed.data.division_id) {
          issues.push({ field: "district_id", message: "The district does not belong to the chosen division" });
        }
      }
      if (issues.length) throw validation(issues);
      data = parsed.data;
    } catch (err) {
      await discard(files);
      throw err;
    }

    const attachments = files.map((f) => ({
      kind: f.fieldname === "video" ? "video" : "photo",
      filename: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
    }));

    let ticket;
    try {
      ticket = await transaction(async (tx) => {
        const row = await tx.queryOne(
          `INSERT INTO grievances
             (submission_type, division_id, district_id, full_name, email, mobile, subject, description, attachments, priority)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [data.submission_type, data.division_id, data.district_id, data.full_name, data.email,
           data.mobile_number, data.subject, data.description, JSON.stringify(attachments),
           data.submission_type === "COMPLAINT" || attachments.length ? "HIGH" : "NORMAL"]
        );
        const updated = await tx.queryOne(
          `UPDATE grievances SET ticket_no = $1 WHERE id = $2 RETURNING *`,
          [ticketNumber(row.id, row.created_at), row.id]
        );
        await tx.query(
          `INSERT INTO grievance_events (grievance_id, event_type, to_status, note) VALUES ($1, 'CREATED', 'NEW', $2)`,
          [row.id, `Submitted from the public portal${attachments.length ? ` with ${attachments.length} attachment(s)` : ""}`]
        );
        return updated;
      });
    } catch (err) {
      await discard(files);
      throw err;
    }

    // Alerts go out after the response is committed; a slow SMS gateway must
    // not hold the citizen's browser.
    alertNewGrievance(ticket).catch((err) => console.error("Grievance alert failed:", err.message));

    return success(res, {
      id: ticket.id,
      ticket_no: ticket.ticket_no,
      submission_type: ticket.submission_type,
      submitted_at: ticket.created_at,
    }, 201);
  })
);

// The complainant's rating page, reached from the closure SMS / e-mail. The
// token is the only key: it is unguessable and identifies one ticket.
const tokenSchema = z.string().regex(/^[a-f0-9]{32}$/, "Invalid link");

async function byToken(token) {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) throw notFound("Ticket");
  const row = await queryOne(
    `SELECT id, ticket_no, subject, status, action_taken_notes, resolved_at, closed_at,
            satisfaction_rating, satisfaction_comment, rated_at
     FROM grievances WHERE feedback_token = $1 AND deleted_at IS NULL`,
    [parsed.data]
  );
  if (!row) throw notFound("Ticket");
  return row;
}

publicRouter.get("/feedback/:token", asyncHandler(async (req, res) => {
  const row = await byToken(req.params.token);
  return success(res, {
    ticket_no: row.ticket_no,
    subject: row.subject,
    status: row.status,
    action_taken_notes: ["RESOLVED", "CLOSED"].includes(row.status) ? row.action_taken_notes : "",
    resolved_at: row.resolved_at,
    rated: Boolean(row.rated_at),
    rating: row.satisfaction_rating,
  });
}));

publicRouter.post("/feedback/:token", submitLimit, asyncHandler(async (req, res) => {
  const row = await byToken(req.params.token);
  if (!["RESOLVED", "CLOSED"].includes(row.status)) {
    throw new AppError("NOT_READY", "This ticket has not been resolved yet", 409);
  }
  if (row.rated_at) throw new AppError("ALREADY_RATED", "Thank you — this ticket has already been rated", 409);
  const parsed = feedbackSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  await query(
    `UPDATE grievances SET satisfaction_rating = $1, satisfaction_comment = $2, rated_at = NOW(), updated_at = NOW()
     WHERE id = $3 AND rated_at IS NULL`,
    [parsed.data.rating, parsed.data.comment, row.id]
  );
  await query(
    `INSERT INTO grievance_events (grievance_id, event_type, note) VALUES ($1, 'RATED', $2)`,
    [row.id, `Complainant rated ${parsed.data.rating}/5${parsed.data.comment ? `: ${parsed.data.comment}` : ""}`]
  );
  return success(res, { rated: true });
}));

// ════════════════════════════════════════════════════════════════════════════
// Admin — every route is confined to the caller's jurisdiction
// ════════════════════════════════════════════════════════════════════════════

export const adminRouter = Router();
adminRouter.use(requireStaff);

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.union([z.enum(STATUSES), z.literal("OPEN"), z.literal("")]).optional().default(""),
  type: z.union([z.enum(SUBMISSION_TYPES), z.literal("")]).optional().default(""),
  sla: z.union([z.enum(["OK", "AMBER", "RED", "MET"]), z.literal("")]).optional().default(""),
  district_id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional().default(""),
  search: z.string().trim().max(100).optional().default(""),
});

adminRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const { page, limit, status, type, sla, district_id: districtId, search } = parsed.data;

  const params = [];
  const conditions = ["g.deleted_at IS NULL", scopeSql(req.user, { district: "g.district_id", division: "g.division_id" }, params)];
  if (status === "OPEN") conditions.push(`g.status NOT IN ('RESOLVED', 'CLOSED')`);
  else if (status) { params.push(status); conditions.push(`g.status = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`g.submission_type = $${params.length}`); }
  if (sla) { params.push(sla); conditions.push(`(${SLA}) = $${params.length}`); }
  if (districtId) { params.push(districtId); conditions.push(`g.district_id = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(g.ticket_no ILIKE $${params.length} OR g.full_name ILIKE $${params.length} OR g.subject ILIKE $${params.length} OR g.mobile ILIKE $${params.length})`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const [{ count }] = await query(`SELECT COUNT(*)::int AS count FROM grievances g ${where}`, params);
  params.push(limit, (page - 1) * limit);
  const rows = await query(
    `SELECT g.id, g.ticket_no, g.submission_type, g.full_name, g.subject, g.status, g.priority,
            g.escalation_level, g.created_at, g.acknowledged_at, g.resolved_at,
            jsonb_array_length(g.attachments) AS attachment_count,
            d.name_mr AS district_mr, d.name_en AS district_en,
            v.name_mr AS division_mr, v.name_en AS division_en,
            ${SLA} AS sla_state,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(g.resolved_at, NOW()) - g.created_at)) / 3600)::int AS age_hours
     FROM grievances g
     JOIN districts d ON d.id = g.district_id
     JOIN vibhags v ON v.id = g.division_id
     ${where}
     ORDER BY (g.status IN ('RESOLVED', 'CLOSED')), g.escalation_level DESC, g.priority = 'HIGH' DESC, g.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return paginated(res, rows, count, page, limit);
}));

// Status counts and SLA buckets for the caller's jurisdiction.
adminRouter.get("/summary", asyncHandler(async (req, res) => {
  const params = [];
  const scope = scopeSql(req.user, { district: "g.district_id", division: "g.division_id" }, params);
  const [row] = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE g.status NOT IN ('RESOLVED', 'CLOSED'))::int AS open,
            COUNT(*) FILTER (WHERE g.status = 'NEW')::int AS new,
            COUNT(*) FILTER (WHERE (${SLA}) = 'AMBER')::int AS amber,
            COUNT(*) FILTER (WHERE (${SLA}) = 'RED')::int AS red,
            COUNT(*) FILTER (WHERE g.escalation_level >= 2 AND g.status NOT IN ('RESOLVED', 'CLOSED'))::int AS critical,
            COUNT(*) FILTER (WHERE g.submission_type = 'COMPLAINT')::int AS complaints,
            COUNT(*) FILTER (WHERE g.submission_type = 'SUGGESTION')::int AS suggestions,
            ROUND(AVG(EXTRACT(EPOCH FROM (g.acknowledged_at - g.created_at)) / 3600)::numeric, 1) AS avg_ack_hours,
            ROUND(AVG(EXTRACT(EPOCH FROM (g.resolved_at - g.created_at)) / 3600)::numeric, 1) AS avg_resolution_hours,
            ROUND(AVG(g.satisfaction_rating)::numeric, 2) AS avg_rating
     FROM grievances g WHERE g.deleted_at IS NULL AND ${scope}`,
    params
  );
  return success(res, row);
}));

async function loadInScope(req, id) {
  const row = await queryOne(
    `SELECT g.*, ${SLA} AS sla_state,
            d.name_mr AS district_mr, d.name_en AS district_en,
            v.name_mr AS division_mr, v.name_en AS division_en,
            ack.name AS acknowledged_by_name, res.name AS resolved_by_name
     FROM grievances g
     JOIN districts d ON d.id = g.district_id
     JOIN vibhags v ON v.id = g.division_id
     LEFT JOIN admin_users ack ON ack.id = g.acknowledged_by
     LEFT JOIN admin_users res ON res.id = g.resolved_by
     WHERE g.id = $1 AND g.deleted_at IS NULL`,
    [id]
  );
  if (!row) throw notFound("Ticket");
  await assertInScope(req.user, { districtId: row.district_id, divisionId: row.division_id });
  return row;
}

// The feedback token is a bearer credential for the complainant; it never
// leaves the server in an admin response.
const adminView = ({ feedback_token: _token, ...row }) => row;

adminRouter.get("/:id", asyncHandler(async (req, res) => {
  const row = await loadInScope(req, parseId(req.params.id));
  const events = await query(
    `SELECT e.id, e.event_type, e.from_status, e.to_status, e.note, e.created_at, u.name AS actor_name, u.role AS actor_role
     FROM grievance_events e LEFT JOIN admin_users u ON u.id = e.actor_id
     WHERE e.grievance_id = $1 ORDER BY e.created_at, e.id`,
    [row.id]
  );
  return success(res, { ...adminView(row), events });
}));

// Attachments are not under the public /uploads mount: a complainant's photos
// are only for the officers whose jurisdiction the ticket is in.
adminRouter.get("/:id/attachments/:filename", asyncHandler(async (req, res) => {
  const row = await loadInScope(req, parseId(req.params.id));
  const file = row.attachments.find((a) => a.filename === req.params.filename);
  if (!file) throw notFound("Attachment");
  res.setHeader("Cache-Control", "private, max-age=300");
  return res.sendFile(path.resolve(process.cwd(), env.upload.dir, "grievances", path.basename(file.filename)));
}));

adminRouter.post("/:id/status", asyncHandler(async (req, res) => {
  const current = await loadInScope(req, parseId(req.params.id));
  const parsed = statusUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const body = parsed.data;
  const issues = checkTransition(current, body);
  if (issues.length) throw validation(issues);

  const updated = await transaction(async (tx) => {
    const row = await tx.queryOne(
      `UPDATE grievances SET
         status = $1,
         action_taken_notes = CASE WHEN $2 <> '' THEN $2 ELSE action_taken_notes END,
         acknowledged_at = CASE WHEN acknowledged_at IS NULL AND $1 <> 'NEW' THEN NOW() ELSE acknowledged_at END,
         acknowledged_by = CASE WHEN acknowledged_at IS NULL AND $1 <> 'NEW' THEN $3 ELSE acknowledged_by END,
         resolved_at = CASE WHEN $1 = 'RESOLVED' THEN NOW() WHEN $1 = 'IN_PROGRESS' THEN NULL ELSE resolved_at END,
         resolved_by = CASE WHEN $1 = 'RESOLVED' THEN $3 WHEN $1 = 'IN_PROGRESS' THEN NULL ELSE resolved_by END,
         closed_at = CASE WHEN $1 = 'CLOSED' THEN NOW() ELSE closed_at END,
         updated_at = NOW()
       WHERE id = $4 AND status = $5
       RETURNING *`,
      [body.status, body.action_taken_notes, req.user.id, current.id, current.status]
    );
    // Someone else moved it first; their change stands.
    if (!row) throw new AppError("CONFLICT", "This ticket was updated by someone else. Reload and try again.", 409);
    const note = [body.note, body.action_taken_notes ? `Action taken: ${body.action_taken_notes}` : ""].filter(Boolean).join("\n");
    await tx.query(
      `INSERT INTO grievance_events (grievance_id, actor_id, event_type, from_status, to_status, note)
       VALUES ($1, $2, 'STATUS', $3, $4, $5)`,
      [row.id, req.user.id, current.status, body.status, note]
    );
    return row;
  });

  await audit(req, "grievance.status", "grievance", updated.id, { from: current.status, to: updated.status, ticket: updated.ticket_no });
  if (updated.status === "RESOLVED" || updated.status === "CLOSED") {
    notifyComplainantOfClosure(updated).catch((err) => console.error("Closure notice failed:", err.message));
  }
  return success(res, adminView(updated));
}));

adminRouter.post("/:id/notes", asyncHandler(async (req, res) => {
  const current = await loadInScope(req, parseId(req.params.id));
  const parsed = z.object({ note: z.string().trim().min(1, "Note is required").max(LIMITS.notesMax) }).safeParse(req.body ?? {});
  if (!parsed.success) throw validation(issuesOf(parsed.error));
  const [event] = await query(
    `INSERT INTO grievance_events (grievance_id, actor_id, event_type, note) VALUES ($1, $2, 'NOTE', $3) RETURNING *`,
    [current.id, req.user.id, parsed.data.note]
  );
  await query(`UPDATE grievances SET updated_at = NOW() WHERE id = $1`, [current.id]);
  return success(res, event, 201);
}));
