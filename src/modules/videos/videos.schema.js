import { z } from "zod";
import { isSafeHttpUrl, MAX_URL_LENGTH } from "../../lib/mediaUrl.js";

// Field rules for a video or reel.
//
// The admin form applies the same rules so mistakes surface while typing, but
// this is what decides. The one rule worth stating plainly: a row must carry
// the content it claims to have. `source_type` picks which column that is, and
// a request that names one source while filling in the other is rejected here
// rather than stored as a row the public page cannot render.

export const CONTENT_TYPES = ["video", "reel"];
export const SOURCE_TYPES = ["upload", "url"];

export const VIDEO_CATEGORIES = [
  "general", "session", "yoga", "training", "success", "event", "awareness", "interview",
];

// An uploaded file is referenced by the public path the server serves it from,
// never by its location on disk. Anything outside /uploads/ would mean the
// column had been pointed somewhere the server does not control.
export const INTERNAL_MEDIA_PATH = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9/._-]{0,255}$/;

const text = (max) => z.string().trim().max(max, `Cannot exceed ${max} characters`);
const requiredText = (max, label) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} cannot exceed ${max} characters`);

const internalPath = (label) =>
  text(300).refine(
    (v) => v === "" || INTERNAL_MEDIA_PATH.test(v),
    `${label} must be a file uploaded through the media library`
  );

const externalUrl = text(MAX_URL_LENGTH).refine(
  (v) => v === "" || isSafeHttpUrl(v),
  "Enter a complete http:// or https:// address"
);

export const videoSchema = z
  .object({
    title_mr: requiredText(300, "Title (Marathi)"),
    title_en: text(300).default(""),
    desc_mr: text(2000).default(""),
    desc_en: text(2000).default(""),
    content_type: z.enum(CONTENT_TYPES, { errorMap: () => ({ message: "Choose Video or Reel" }) }),
    source_type: z.enum(SOURCE_TYPES, { errorMap: () => ({ message: "Choose an upload or an external URL" }) }),
    media_id: z.number().int().positive().nullable().optional().default(null),
    media_url: internalPath("The video file").default(""),
    external_url: externalUrl.default(""),
    // The school a success story is about. Optional: most videos are about
    // the programme rather than one school.
    varg_id: z
      .union([z.number().int().positive(), z.literal(null), z.literal("")])
      .optional()
      .nullable()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    thumbnail_id: z.number().int().positive().nullable().optional().default(null),
    thumbnail_url: internalPath("The thumbnail").default(""),
    category: z.enum(VIDEO_CATEGORIES).default("general"),
    // Null rather than zero: "not known" and "zero seconds" are different, and
    // a zero would be rendered as a real 0:00 running time.
    duration_seconds: z.number().int().min(0).max(86400).nullable().optional().default(null),
    published: z.boolean().default(false),
    display_order: z.number().int().min(0).max(9999).default(0),
  })
  .superRefine((d, ctx) => {
    if (d.source_type === "upload" && !d.media_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["media_url"], message: "Upload a video file" });
    }
    if (d.source_type === "url" && !d.external_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["external_url"], message: "Enter the video URL" });
    }
  })
  // Whichever source was not chosen is cleared, so switching from an upload to
  // a link cannot leave a stale file reference behind on the row.
  .transform((d) =>
    d.source_type === "upload"
      ? { ...d, external_url: "" }
      : { ...d, media_url: "", media_id: null }
  );
