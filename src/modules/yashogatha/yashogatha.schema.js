import { z } from "zod";
import { TARGET_VALUES } from "../hero/hero.defaults.js";

// Server-side rules for the Yashogatha section wording.
//
// Only the chrome lives here; story records are validated by the stories module
// and are not touched. The admin form applies the same limits, but this is what
// decides.

const text = (max) => z.string().trim().max(max);
const required = (max, label) => z.string().trim().min(1, `${label} is required`).max(max);

export const yashogathaSchema = z.object({
  text: z.object({
    badge_mr: text(80).default(""),
    badge_en: text(80).default(""),
    title_mr: required(120, "Marathi heading"),
    title_en: text(120).default(""),
    lead_mr: text(300).default(""),
    lead_en: text(300).default(""),
    eyebrow_dot: z.boolean().default(true),
  }),
  labels: z.object({
    read_more_mr: required(60, "Marathi read-more label"),
    read_more_en: text(60).default(""),
    view_all_mr: required(80, "Marathi view-all label"),
    view_all_en: text(80).default(""),
    sample_tag_mr: text(60).default(""),
    sample_tag_en: text(60).default(""),
    no_stories_mr: text(200).default(""),
    no_stories_en: text(200).default(""),
  }),
  detail_note: z.object({
    text_mr: text(400).default(""),
    text_en: text(400).default(""),
    enabled: z.boolean().default(true),
  }),
  homepage: z.object({
    // The strip is built for a small set; more would push the page down.
    featured_count: z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Must be a whole number")
      .min(1, "Show at least one story")
      .max(12, "At most 12 stories on the home page"),
    view_all_target: z.enum(TARGET_VALUES),
    enabled: z.boolean().default(true),
  }),
});

export function parseYashogatha(body) {
  return yashogathaSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
