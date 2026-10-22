import { z } from "zod";
import { isSafeHttpUrl, MAX_URL_LENGTH } from "../../lib/mediaUrl.js";
import { INTERNAL_MEDIA_PATH, SOURCE_TYPES } from "../videos/videos.schema.js";

// Field rules for a podcast episode.
//
// The source split is the same as a video's — `source_type` picks which column
// carries the audio, and the unused one is cleared on save — so the two
// modules behave identically where an administrator would expect them to.

export { SOURCE_TYPES };

export const PODCAST_CATEGORIES = [
  "general", "session", "interview", "guidance", "story", "training", "awareness",
];

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

// A date column, so the value has to be a calendar date rather than anything
// Postgres would try to coerce. Empty means "no date shown".
const isoDate = text(10).refine(
  (v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))),
  "Enter a valid date"
);

export const podcastSchema = z
  .object({
    title_mr: requiredText(300, "Title (Marathi)"),
    title_en: text(300).default(""),
    desc_mr: text(4000).default(""),
    desc_en: text(4000).default(""),
    source_type: z.enum(SOURCE_TYPES, { errorMap: () => ({ message: "Choose an upload or an external URL" }) }),
    media_id: z.number().int().positive().nullable().optional().default(null),
    media_url: internalPath("The audio file").default(""),
    external_url: externalUrl.default(""),
    cover_id: z.number().int().positive().nullable().optional().default(null),
    cover_url: internalPath("The cover image").default(""),
    category: z.enum(PODCAST_CATEGORIES).default("general"),
    // Detected by the browser from the file where it can be, typed in where it
    // cannot. Null means unknown, which the site renders as no running time
    // rather than as 0:00.
    duration_seconds: z.number().int().min(0).max(86400).nullable().optional().default(null),
    publish_date: isoDate.default(""),
    published: z.boolean().default(false),
    display_order: z.number().int().min(0).max(9999).default(0),
  })
  .superRefine((d, ctx) => {
    if (d.source_type === "upload" && !d.media_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["media_url"], message: "Upload an audio file" });
    }
    if (d.source_type === "url" && !d.external_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["external_url"], message: "Enter the audio or episode URL" });
    }
  })
  .transform((d) =>
    d.source_type === "upload"
      ? { ...d, external_url: "" }
      : { ...d, media_url: "", media_id: null }
  );
