import { z } from "zod";
import { ICONS, TARGET_VALUES } from "../hero/hero.defaults.js";

// Server-side rules for the Activities section.
//
// The admin form applies the same limits so mistakes surface early, but this is
// what decides: a crafted request cannot store an icon the site cannot draw, a
// destination that does not exist, a blank required title, or text past what the
// card layout is built for.

const text = (max) => z.string().trim().max(max);
const required = (max, label) => z.string().trim().min(1, `${label} is required`).max(max);

const itemId = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Invalid id");

const uniqueIds = (items, ctx) => {
  const seen = new Set();
  items.forEach((item, i) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate id "${item.id}"`, path: [i, "id"] });
    }
    seen.add(item.id);
  });
};

// The pills under each card. Blank entries are dropped rather than rejected, so
// an empty row left in the editor cannot block a save.
const gains = z
  .array(z.string().trim().max(60))
  .max(8, "At most 8 outcomes per card")
  .default([])
  .transform((list) => list.filter((g) => g.length > 0));

const itemSchema = z.object({
  id: itemId,
  icon: z.enum(ICONS),
  title_mr: required(160, "Marathi title"),
  title_en: text(160).default(""),
  gains_mr: gains,
  gains_en: gains,
  enabled: z.boolean().default(true),
});

export const activitiesSchema = z.object({
  text: z.object({
    badge_mr: text(80).default(""),
    badge_en: text(80).default(""),
    title_mr: required(120, "Marathi heading"),
    title_en: text(120).default(""),
    lead_mr: text(300).default(""),
    lead_en: text(300).default(""),
    gains_label_mr: text(80).default(""),
    gains_label_en: text(80).default(""),
    eyebrow_dot: z.boolean().default(true),
  }),
  cta: z.object({
    label_mr: text(80).default(""),
    label_en: text(80).default(""),
    target: z.enum(TARGET_VALUES),
    enabled: z.boolean().default(true),
  }),
  // The grid is built for a handful of cards; more stops reading as a set.
  items: z.array(itemSchema).min(1, "At least one activity is required").max(12).superRefine(uniqueIds),
});

export function parseActivities(body) {
  return activitiesSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
