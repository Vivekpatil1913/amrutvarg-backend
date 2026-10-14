import { z } from "zod";

// Server-side rules for the Session section.
//
// The admin form applies the same limits so mistakes surface early, but this is
// what decides: a crafted request cannot store a blank required title, a
// negative or absurd duration, or text past what the card layout is built for.

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

const stepSchema = z.object({
  id: itemId,
  // 0 means the step carries no clock: it is shown without a duration and is
  // left out of the hour-breakdown bar, which is how the opening prayer and the
  // closing mantra are represented.
  min: z.coerce
    .number({ invalid_type_error: "Enter a whole number of minutes" })
    .int("Minutes must be a whole number")
    .min(0, "Minutes cannot be negative")
    .max(120, "A single step cannot exceed 120 minutes"),
  title_mr: required(120, "Marathi title"),
  title_en: text(120).default(""),
  desc_mr: text(400).default(""),
  desc_en: text(400).default(""),
  enabled: z.boolean().default(true),
});

export const sessionSchema = z.object({
  text: z.object({
    badge_mr: text(80).default(""),
    badge_en: text(80).default(""),
    title_mr: required(160, "Marathi heading"),
    title_en: text(160).default(""),
    lead_mr: text(300).default(""),
    lead_en: text(300).default(""),
    hour_label_mr: text(80).default(""),
    hour_label_en: text(80).default(""),
    minutes_mr: text(20).default(""),
    minutes_en: text(20).default(""),
    eyebrow_dot: z.boolean().default(true),
  }),
  steps: z.array(stepSchema).min(1, "At least one step is required").max(15).superRefine(uniqueIds),
});

export function parseSession(body) {
  return sessionSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
