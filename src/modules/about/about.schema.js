import { z } from "zod";
import { ICONS } from "../hero/hero.defaults.js";

// Server-side rules for the About section.
//
// Everything the admin can submit is checked here, so a crafted request cannot
// reach the table with an icon the site cannot draw, a blank required heading,
// or text past the length the layout is built for. The admin form applies the
// same limits, but the server is what decides.

const text = (max) => z.string().trim().max(max);
const required = (max, label) => z.string().trim().min(1, `${label} is required`).max(max);
const icon = z.enum(ICONS);

// Stable id the admin UI generates, used as a React key and for reordering.
const itemId = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Invalid id");

// Ids within a list must be unique; duplicates make reordering ambiguous.
const uniqueIds = (items, ctx) => {
  const seen = new Set();
  items.forEach((item, i) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate id "${item.id}"`, path: [i, "id"] });
    }
    seen.add(item.id);
  });
};

const stepSchema = z.object({
  id: itemId,
  icon,
  question_mr: required(80, "Marathi question"),
  question_en: text(80).default(""),
  title_mr: required(120, "Marathi title"),
  title_en: text(120).default(""),
  desc_mr: text(600).default(""),
  desc_en: text(600).default(""),
  enabled: z.boolean().default(true),
});

const featureSchema = z.object({
  id: itemId,
  label_mr: required(60, "Marathi label"),
  label_en: text(60).default(""),
  enabled: z.boolean().default(true),
});

export const aboutSchema = z.object({
  text: z.object({
    badge_mr: text(80).default(""),
    badge_en: text(80).default(""),
    title_mr: required(120, "Marathi heading"),
    title_en: text(120).default(""),
    eyebrow_dot: z.boolean().default(true),
  }),
  image: z.object({
    media_id: z.number().int().positive().nullable().default(null),
    url: z.string().trim().max(500).default(""),
    alt_mr: text(300).default(""),
    alt_en: text(300).default(""),
    caption_mr: text(200).default(""),
    caption_en: text(200).default(""),
    enabled: z.boolean().default(true),
  }),
  // The layout is a vertical path; more than eight steps stops reading as one.
  steps: z.array(stepSchema).min(1, "At least one step is required").max(8).superRefine(uniqueIds),
  features: z.object({
    title_mr: text(80).default(""),
    title_en: text(80).default(""),
    icon: icon.default("sparkle"),
    enabled: z.boolean().default(true),
    items: z.array(featureSchema).max(12).superRefine(uniqueIds),
  }),
});

export function parseAbout(body) {
  return aboutSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
