import { Router } from "express";
import { query, queryOne } from "../../db/pool.js";
import { requireAdmin } from "../../middleware/auth.js";
import { uploadMedia, uploadVideoFile, uploadAudioFile } from "../../middleware/upload.js";
import { asyncHandler, notFound, success, paginated, AppError } from "../../lib/errors.js";
import path from "path";
import { unlink } from "fs/promises";
import { env } from "../../config/env.js";
import { z } from "zod";
import { validation } from "../../lib/errors.js";
import {
  hasAllowedImageSignature, hasAllowedVideoSignature, hasAllowedAudioSignature,
} from "../../middleware/upload.js";

const router = Router();
const idSchema = z.string().regex(/^[1-9]\d*$/).refine((value) => Number.isSafeInteger(Number(value))).transform(Number);
const altSchema = z.object({ alt_text: z.string().trim().max(500).optional().default("") });

// `media_assets.path` is a location on this server's disk. It is needed to
// delete the file and for nothing else, so it never leaves the process — the
// public `url` is what every caller actually uses.
const publicAsset = ({ path: _diskPath, ...rest }) => rest;

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit || "25")));
  const search = (req.query.search || "").trim();
  const offset = (page - 1) * pageSize;

  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(original_name ILIKE $${params.length} OR alt_text ILIKE $${params.length})`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const [{ count }] = await query(`SELECT COUNT(*) AS count FROM media_assets ${where}`, params);

  params.push(pageSize, offset);
  const rows = await query(
    `SELECT * FROM media_assets ${where} ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return paginated(res, rows.map(publicAsset), parseInt(count), page, pageSize);
}));

router.post(
  "/upload",
  requireAdmin,
  uploadMedia.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError("VALIDATION_ERROR", "No file uploaded", 422);

    const alt = altSchema.safeParse(req.body);
    if (!alt.success) {
      await unlink(req.file.path).catch(() => {});
      throw validation(alt.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    if (!(await hasAllowedImageSignature(req.file.path))) {
      await unlink(req.file.path).catch(() => {});
      throw new AppError("VALIDATION_ERROR", "Uploaded file content is not a supported image", 422);
    }

    const url = `/uploads/media/${req.file.filename}`;
    try {
      const [row] = await query(
        `INSERT INTO media_assets (filename, original_name, mime_type, size_bytes, path, url, alt_text, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          req.file.filename, req.file.originalname.slice(0, 255), req.file.mimetype,
          req.file.size, req.file.path, url,
          alt.data.alt_text, req.user.id,
        ]
      );
      return success(res, publicAsset(row), 201);
    } catch (error) {
      await unlink(req.file.path).catch(() => {});
      throw error;
    }
  })
);

// Video and audio uploads.
//
// Same shape as the image upload above and the same two gates, in the same
// order: multer's fileFilter rejects an unacceptable declared type before a
// byte is written, then the file's own signature is read from disk and has to
// agree. A rejected file is removed rather than left behind, and so is a file
// whose database row could not be written — an orphan on disk is still a file
// the server is hosting.
function mediaUpload({ folder, verify, kind }) {
  return asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError("VALIDATION_ERROR", `No ${kind} file uploaded`, 422);

    const discard = async () => { await unlink(req.file.path).catch(() => {}); };

    const alt = altSchema.safeParse(req.body);
    if (!alt.success) {
      await discard();
      throw validation(alt.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    if (!(await verify(req.file.path, { expectedMime: req.file.mimetype }))) {
      await discard();
      throw new AppError(
        "VALIDATION_ERROR",
        `That file is not a readable ${kind} file, or its contents do not match its type`,
        422
      );
    }

    const url = `/uploads/${folder}/${req.file.filename}`;
    try {
      const [row] = await query(
        `INSERT INTO media_assets (filename, original_name, mime_type, size_bytes, path, url, alt_text, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          req.file.filename, req.file.originalname.slice(0, 255), req.file.mimetype,
          req.file.size, req.file.path, url, alt.data.alt_text, req.user.id,
        ]
      );
      return success(res, publicAsset(row), 201);
    } catch (error) {
      await discard();
      throw error;
    }
  });
}

router.post(
  "/upload/video",
  requireAdmin,
  uploadVideoFile.single("file"),
  mediaUpload({ folder: "video", verify: hasAllowedVideoSignature, kind: "video" })
);

router.post(
  "/upload/audio",
  requireAdmin,
  uploadAudioFile.single("file"),
  mediaUpload({ folder: "audio", verify: hasAllowedAudioSignature, kind: "audio" })
);

// What the admin forms show as the ceiling, so the limit is stated in one
// place — the server — rather than duplicated as a constant in the UI.
router.get("/limits", requireAdmin, asyncHandler(async (_req, res) =>
  success(res, {
    imageMaxMb: env.upload.maxMb,
    videoMaxMb: env.upload.maxVideoMb,
    audioMaxMb: env.upload.maxAudioMb,
  })
));

router.put("/:id/alt", requireAdmin, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const parsed = altSchema.safeParse(req.body);
  if (!parsed.success) throw validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const [row] = await query(
    `UPDATE media_assets SET alt_text = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
    [parsed.data.alt_text, parsedId.data]
  );
  if (!row) throw notFound("Media asset");
  return success(res, publicAsset(row));
}));

router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) throw validation([{ field: "id", message: "A positive record ID is required" }]);
  const asset = await queryOne(
    `SELECT * FROM media_assets WHERE id = $1 AND deleted_at IS NULL`, [parsedId.data]
  );
  if (!asset) throw notFound("Media asset");

  // Soft delete only — don't delete file in case it's still referenced
  await query(`UPDATE media_assets SET deleted_at = NOW() WHERE id = $1`, [parsedId.data]);
  return success(res, { id: asset.id, deleted: true });
}));

export default router;
