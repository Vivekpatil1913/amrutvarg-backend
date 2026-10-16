import multer from "multer";
import path from "path";
import crypto from "crypto";
import { open, readFile } from "fs/promises";
import { mkdirSync } from "fs";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// What a browser is allowed to claim it is sending. This is only the cheap
// first gate — the file's own bytes decide, below, after it has been written.
const ALLOWED_VIDEO_TYPES = [
  "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-m4v",
];
const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave",
  "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/flac", "audio/x-flac",
  "audio/webm",
];

function safeFilename(original) {
  const ext = path.extname(original).toLowerCase();
  const rand = crypto.randomBytes(8).toString("hex");
  return `${Date.now()}-${rand}${ext}`;
}

// multer does not create its destination, and a missing folder surfaces as an
// opaque ENOENT in the middle of an upload. The two original folders are in
// the repository; video/ and audio/ are new, so every one is ensured here.
for (const sub of ["photos", "media", "video", "audio"]) {
  mkdirSync(path.join(env.upload.dir, sub), { recursive: true });
}

function makeStorage(sub) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(env.upload.dir, sub)),
    filename: (req, file, cb) => cb(null, safeFilename(file.originalname)),
  });
}

const photoStorage = makeStorage("photos");
const mediaStorage = makeStorage("media");

// Rejects on the declared type before a byte is written. The file's own
// signature is what finally decides, once it is on disk.
function typeFilter(allowed, message) {
  return (req, file, cb) => {
    if (allowed.includes(String(file.mimetype).toLowerCase())) return cb(null, true);
    cb(new AppError("VALIDATION_ERROR", message, 422));
  };
}

const imageFilter = typeFilter(
  ALLOWED_IMAGE_TYPES,
  "Only image files are allowed (JPEG, PNG, WebP, GIF)"
);

// Only the opening bytes are needed to identify a container, and a video can
// be a hundred megabytes — reading the whole file into memory to look at
// twelve of them would be a denial-of-service waiting to happen.
async function readHead(filePath, length = 64) {
  const handle = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const ascii = (bytes, start, end) =>
  bytes.length >= end ? bytes.toString("ascii", start, end) : "";

// MP4, M4A, M4V and MOV all share the ISO base media layout: a box length,
// then the literal "ftyp", then a four-character brand saying which it is.
function isoBrand(bytes) {
  return ascii(bytes, 4, 8) === "ftyp" ? ascii(bytes, 8, 12) : "";
}

const isEbml = (bytes) =>
  bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;

const isOgg = (bytes) => ascii(bytes, 0, 4) === "OggS";

const isRiffWave = (bytes) => ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE";

// "ID3" tag, or a raw MPEG frame sync: eleven set bits.
const isMp3 = (bytes) =>
  ascii(bytes, 0, 3) === "ID3" ||
  (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);

/**
 * Identifies a video container from its own bytes.
 * Returns true when the content is a supported container, and — when
 * `expectedMime` is given — when it also agrees with what was declared.
 */
export async function hasAllowedVideoSignature(filePath, { expectedMime } = {}) {
  const bytes = await readHead(filePath);
  const brand = isoBrand(bytes);
  let detected = "";
  if (brand) detected = brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
  else if (isEbml(bytes)) detected = "video/webm";
  else if (isOgg(bytes)) detected = "video/ogg";
  if (!detected) return false;
  if (!expectedMime) return true;
  // A .m4v is served as video/x-m4v but is an MP4 container; WebM and
  // Matroska share the EBML header. Compare the family, not the exact string.
  const family = (m) => String(m).split("/")[0];
  if (family(expectedMime) !== "video") return false;
  if (detected === "video/mp4") return /mp4|quicktime|m4v/.test(expectedMime);
  if (detected === "video/webm") return /webm|matroska/.test(expectedMime);
  if (detected === "video/ogg") return /ogg/.test(expectedMime);
  return detected === expectedMime;
}

/**
 * Identifies an audio container from its own bytes. Same contract as
 * hasAllowedVideoSignature.
 */
export async function hasAllowedAudioSignature(filePath, { expectedMime } = {}) {
  const bytes = await readHead(filePath);
  const brand = isoBrand(bytes);
  let detected = "";
  if (brand) detected = "audio/mp4";
  else if (isRiffWave(bytes)) detected = "audio/wav";
  else if (ascii(bytes, 0, 4) === "fLaC") detected = "audio/flac";
  else if (isOgg(bytes)) detected = "audio/ogg";
  else if (isEbml(bytes)) detected = "audio/webm";
  // Checked last: an MPEG frame sync is two bytes and would shadow the others.
  else if (isMp3(bytes)) detected = "audio/mpeg";
  if (!detected) return false;
  if (!expectedMime) return true;
  if (!String(expectedMime).startsWith("audio/")) return false;
  if (detected === "audio/mp4") return /mp4|m4a|m4b|aac/.test(expectedMime);
  if (detected === "audio/wav") return /wav|wave/.test(expectedMime);
  if (detected === "audio/mpeg") return /mpeg|mp3|aac/.test(expectedMime);
  if (detected === "audio/ogg") return /ogg|opus|vorbis/.test(expectedMime);
  return detected === expectedMime;
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

export const uploadVideoFile = multer({
  storage: makeStorage("video"),
  limits: { fileSize: env.upload.maxVideoMb * 1024 * 1024, files: 1 },
  fileFilter: typeFilter(
    ALLOWED_VIDEO_TYPES,
    "Only MP4, WebM, OGG or QuickTime video files are allowed"
  ),
});

export const uploadAudioFile = multer({
  storage: makeStorage("audio"),
  limits: { fileSize: env.upload.maxAudioMb * 1024 * 1024, files: 1 },
  fileFilter: typeFilter(
    ALLOWED_AUDIO_TYPES,
    "Only MP3, WAV, M4A, AAC, OGG or FLAC audio files are allowed"
  ),
});
