import multer from "multer";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function safeFilename(original) {
  const ext = path.extname(original).toLowerCase();
  const rand = crypto.randomBytes(8).toString("hex");
  return `${Date.now()}-${rand}${ext}`;
}

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(env.upload.dir, "photos")),
  filename: (req, file, cb) => cb(null, safeFilename(file.originalname)),
});

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(env.upload.dir, "media")),
  filename: (req, file, cb) => cb(null, safeFilename(file.originalname)),
});

function imageFilter(req, file, cb) {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new AppError("VALIDATION_ERROR", "Only image files are allowed (JPEG, PNG, WebP, GIF)", 422));
}

export const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: env.upload.maxMb * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: env.upload.maxMb * 1024 * 1024 },
  fileFilter: imageFilter,
});
