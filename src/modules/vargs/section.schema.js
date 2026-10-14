import { z } from "zod";
import {
  STAT_SOURCE_VALUES,
  STAT_ICONS,
  ORDER_SOURCE_VALUES,
} from "./section.defaults.js";

// Server-side rules for the Amrut Varg section's wording.
//
// The varg records themselves are validated by vargs.routes.js and the
// geography by the masters module; only the chrome is decided here. The admin
// form applies the same limits, but this is what actually decides — a request
// that skips the form still has to pass.

const text = (max) => z.string().trim().max(max);
const required = (max, label) =>
  z.string().trim().min(1, `${label} is required`).max(max);

// A phrase with placeholders the site substitutes. Anything in braces that is
// not on the allowed list is a typo that would otherwise reach the page as
// literal text, so it is rejected here rather than shown to a visitor.
function template(max, allowed, { require: req = null, label = "This" } = {}) {
  const names = allowed.join(", ");
  return z
    .string()
    .trim()
    .max(max)
    .superRefine((value, ctx) => {
      if (!value) return;
      for (const m of value.matchAll(/\{([^}]*)\}/g)) {
        if (!allowed.includes(m[1])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown placeholder {${m[1]}} — use ${names.replace(/(\w+)/g, "{$1}")}`,
          });
          return;
        }
      }
      if (req && !value.includes(`{${req}}`)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must include {${req}}, which is replaced with the number`,
        });
      }
    });
}

const COUNT = ["count"];
const NAME = ["name"];

const statItem = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "A key is required")
      .max(40)
      .regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, hyphen and underscore only"),
    icon: z.enum(STAT_ICONS, { errorMap: () => ({ message: "Pick one of the listed icons" }) }),
    label_mr: required(60, "Marathi label"),
    label_en: text(60).default(""),
    source: z.enum(STAT_SOURCE_VALUES, {
      errorMap: () => ({ message: "Pick where the number comes from" }),
    }),
    manual_value: z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Must be a whole number")
      .min(0, "Cannot be negative")
      .max(1_000_000, "That number is too large")
      .default(0),
  })
  // A counted statistic ignores manual_value; a manual one has nothing else to
  // show, so the number has to be given.
  .superRefine((item, ctx) => {
    if (item.source === "manual" && !Number.isInteger(item.manual_value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manual_value"],
        message: "A manual statistic needs a number",
      });
    }
  });

export const vargsSectionSchema = z.object({
  text: z.object({
    badge_mr: text(80).default(""),
    badge_en: text(80).default(""),
    title_mr: required(120, "Marathi heading"),
    title_en: text(120).default(""),
    lead_mr: template(400, COUNT).default(""),
    lead_en: template(400, COUNT).default(""),
    empty_mr: text(300).default(""),
    empty_en: text(300).default(""),
    eyebrow_dot: z.boolean().default(true),
  }),

  stats: z.object({
    enabled: z.boolean().default(true),
    items: z
      .array(statItem)
      .max(4, "At most four statistics fit across the strip")
      .default([])
      // Two cards with the same key would collide in the page's keyed list.
      .superRefine((items, ctx) => {
        const seen = new Set();
        items.forEach((item, i) => {
          const k = item.key?.toLowerCase();
          if (seen.has(k)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, "key"],
              message: "Another statistic already uses this key",
            });
          }
          seen.add(k);
        });
      }),
  }),

  atlas: z.object({
    enabled: z.boolean().default(true),
    title_mr: required(120, "Marathi atlas heading"),
    title_en: text(120).default(""),
    note_mr: text(300).default(""),
    note_en: text(300).default(""),
    all_divisions_mr: required(80, "Marathi all-divisions label"),
    all_divisions_en: text(80).default(""),
    all_districts_mr: template(160, COUNT, { require: "count", label: "The all-districts line" }),
    all_districts_en: template(160, COUNT).default(""),
    districts_in_mr: template(160, NAME, { require: "name", label: "The districts-in line" }),
    districts_in_en: template(160, NAME).default(""),
    division_order: z.enum(ORDER_SOURCE_VALUES, {
      errorMap: () => ({ message: "Pick how divisions are ordered" }),
    }),
    district_order: z.enum(ORDER_SOURCE_VALUES, {
      errorMap: () => ({ message: "Pick how districts are ordered" }),
    }),
    show_district_chips: z.boolean().default(true),
  }),

  search: z.object({
    enabled: z.boolean().default(true),
    placeholder_mr: required(160, "Marathi search placeholder"),
    placeholder_en: text(160).default(""),
    label_mr: required(120, "Marathi search label"),
    label_en: text(120).default(""),
    viewing_mr: required(80, "Marathi viewing label"),
    viewing_en: text(80).default(""),
    results_count_mr: template(160, COUNT, { require: "count", label: "The Marathi result count" }),
    results_count_en: template(160, COUNT).default(""),
    no_match_mr: text(300).default(""),
    no_match_en: text(300).default(""),
    none_in_district_mr: template(300, NAME).default(""),
    none_in_district_en: template(300, NAME).default(""),
    clear_filters_mr: text(80).default(""),
    clear_filters_en: text(80).default(""),
  }),

  card: z.object({
    pass_label_mr: required(60, "Marathi card label"),
    pass_label_en: text(60).default(""),
    cta_mr: required(60, "Marathi button label"),
    cta_en: text(60).default(""),
    division_suffix_mr: template(80, NAME, { require: "name", label: "The Marathi division line" }),
    division_suffix_en: template(80, NAME).default(""),
    read_more_mr: required(60, "Marathi read-more label"),
    read_more_en: text(60).default(""),
    read_less_mr: required(60, "Marathi read-less label"),
    read_less_en: text(60).default(""),
    show_coordinator: z.boolean().default(false),
  }),

  list: z.object({
    // Six cards is two rows of three; far more would push the atlas off screen.
    page_size: z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Must be a whole number")
      .min(3, "Show at least three cards a page")
      .max(24, "At most 24 cards a page"),
    show_source_note: z.boolean().default(true),
  }),
});

export function parseVargsSection(body) {
  return vargsSectionSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
