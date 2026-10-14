import { z } from "zod";
import { ICONS, TARGET_VALUES, STAT_SOURCE_VALUES } from "./hero.defaults.js";

// Admin text is rendered as plain text by the frontend, never as HTML. These
// rules keep what reaches the database sane; they are not an HTML sanitiser,
// because no field is ever interpreted as markup.
const text = (max) => z.string().trim().max(max);
const icon = z.enum(ICONS);
const target = z.enum(TARGET_VALUES);

// Slug-ish id the admin UI generates for list items so React keys and
// reordering stay stable across saves.
const itemId = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Invalid id");

const imageSchema = z.object({
  media_id: z.number().int().positive().nullable().default(null),
  url: z.string().trim().max(500).default(""),
  alt_mr: text(300).default(""),
  alt_en: text(300).default(""),
  enabled: z.boolean().default(true),
});

const ctaSchema = z.object({
  id: itemId,
  label_mr: text(80).min(1, "Marathi label is required"),
  label_en: text(80).default(""),
  icon: icon,
  target: target,
  enabled: z.boolean().default(true),
});

const statSchema = z.object({
  id: itemId,
  label_mr: text(80).min(1, "Marathi label is required"),
  label_en: text(80).default(""),
  value_mr: text(80).default(""),
  value_en: text(80).default(""),
  source: z.enum(STAT_SOURCE_VALUES).default("manual"),
  enabled: z.boolean().default(true),
});

const quickNavSchema = z.object({
  id: itemId,
  title_mr: text(80).min(1, "Marathi title is required"),
  title_en: text(80).default(""),
  desc_mr: text(160).default(""),
  desc_en: text(160).default(""),
  icon: icon,
  target: target,
  enabled: z.boolean().default(true),
});

// A manual statistic has nothing to show without a value; a counted one takes
// its number from the database and ignores whatever sits in the value fields.
const statWithValue = statSchema.refine(
  (s) => s.source !== "manual" || s.value_mr.length > 0,
  { message: "A manual statistic needs a Marathi value", path: ["value_mr"] }
);

// Array ids must be unique: duplicates would collide as React keys and make
// reordering ambiguous.
const uniqueIds = (items, ctx) => {
  const seen = new Set();
  items.forEach((item, i) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate id "${item.id}"`, path: [i, "id"] });
    }
    seen.add(item.id);
  });
};

export const heroSchema = z.object({
  text: z.object({
    eyebrow_mr: text(160).default(""),
    eyebrow_en: text(160).default(""),
    title_mr: text(80).min(1, "Marathi title is required"),
    title_en: text(80).default(""),
    tagline_mr: text(200).default(""),
    tagline_en: text(200).default(""),
    desc_mr: text(600).default(""),
    desc_en: text(600).default(""),
    eyebrow_dot: z.boolean().default(true),
  }),
  images: z.object({
    main: imageSchema,
    small: imageSchema,
    caption_mr: text(160).default(""),
    caption_en: text(160).default(""),
    caption_icon: icon.default("sun"),
    caption_enabled: z.boolean().default(true),
  }),
  // Two CTAs is what the layout is built for; more would wrap badly.
  ctas: z.array(ctaSchema).max(2).superRefine(uniqueIds),
  stats: z.array(statWithValue).max(8).superRefine(uniqueIds),
  quicknav: z.array(quickNavSchema).max(8).superRefine(uniqueIds),
  a11y: z.object({
    quick_label_mr: text(80).default("झटपट दुवे"),
    quick_label_en: text(80).default("Quick links"),
  }),
});

export function parseHero(body) {
  return heroSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
