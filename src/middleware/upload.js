import multer from "multer";
import path from "path";
import crypto from "crypto";
import { readFile } from "fs/promises";
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

export async function hasAllowedImageSignature(filePath, { allowGif = true, expectedMime } = {}) {
  const bytes = await readFile(filePath);
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const gif = allowGif && bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
  const detected = jpeg ? "image/jpeg" : png ? "image/png" : webp ? "image/webp" : gif ? "image/gif" : "";
  return Boolean(detected) && (!expectedMime || detected === expectedMime);
}

export const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: Math.min(env.upload.maxMb, 3) * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: env.upload.maxMb * 1024 * 1024 },
  fileFilter: imageFilter,
});
