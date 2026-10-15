import { z } from "zod";
import { COUNT_TOKENS, SHOWING_TOKENS, DIVISION_TOKENS } from "./directory.defaults.js";

// Server-side rules for the District Directory page wording.
//
// The admin form applies the same limits so mistakes surface early, but this is
// what decides: a crafted request cannot store a blank required heading, a
// template that has lost the placeholder it exists to carry, or a link that is
// not a real address.

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

// A template exists to carry a value into the sentence. Dropping the
// placeholder leaves a line that reads fine in the editor and silently loses
// the number on the site, so it is rejected rather than stored.
const template = (max, tokens, label) =>
  z.string().trim().min(1, `${label} is required`).max(max).superRefine((value, ctx) => {
    const missing = tokens.filter((token) => !value.includes(token));
    if (missing.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Keep the placeholder${missing.length > 1 ? "s" : ""} ${missing.join(" and ")} in this line`,
      });
    }
  });

// Only http(s) and only an absolute URL: these open in a new tab, so a
// "javascript:" or a relative string reaching the published site would be
// either dangerous or broken. Empty means "hide the button".
const linkUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a full http:// or https:// address")
  .default("");

const roleSchema = z.object({
  id: itemId,
  label_mr: required(60, "Marathi label"),
  label_en: text(60).default(""),
  // The role whose card is shown wide at the top of its division.
  featured: z.boolean().default(false),
});

export const directorySchema = z.object({
  text: z.object({
    badge_mr: text(80).default(""),
    badge_en: text(80).default(""),
    title_mr: required(200, "Marathi heading"),
    title_en: text(200).default(""),
    lead_mr: text(400).default(""),
    lead_en: text(400).default(""),
    breadcrumb_mr: text(80).default(""),
    breadcrumb_en: text(80).default(""),
    search_label_mr: text(120).default(""),
    search_label_en: text(120).default(""),
    search_placeholder_mr: text(120).default(""),
    search_placeholder_en: text(120).default(""),
    district_label_mr: text(80).default(""),
    district_label_en: text(80).default(""),
    all_districts_mr: text(80).default(""),
    all_districts_en: text(80).default(""),
    count_one_mr: template(80, COUNT_TOKENS, "Marathi singular count"),
    count_one_en: template(80, COUNT_TOKENS, "English singular count"),
    count_many_mr: template(80, COUNT_TOKENS, "Marathi plural count"),
    count_many_en: template(80, COUNT_TOKENS, "English plural count"),
    showing_mr: template(160, SHOWING_TOKENS, "Marathi paging line"),
    showing_en: template(160, SHOWING_TOKENS, "English paging line"),
    pagination_mr: text(80).default(""),
    pagination_en: text(80).default(""),
    no_results_mr: text(200).default(""),
    no_results_en: text(200).default(""),
    clear_filters_mr: text(80).default(""),
    clear_filters_en: text(80).default(""),
    division_label_mr: template(80, DIVISION_TOKENS, "Marathi division heading"),
    division_label_en: template(80, DIVISION_TOKENS, "English division heading"),
    whole_division_mr: text(80).default(""),
    whole_division_en: text(80).default(""),
    call_mr: text(40).default(""),
    call_en: text(40).default(""),
    email_mr: text(40).default(""),
    email_en: text(40).default(""),
    pending_title_mr: text(120).default(""),
    pending_title_en: text(120).default(""),
    pending_desc_mr: text(600).default(""),
    pending_desc_en: text(600).default(""),
    official_mr: text(120).default(""),
    official_en: text(120).default(""),
    submit_info_mr: text(120).default(""),
    submit_info_en: text(120).default(""),
    state_note_mr: text(200).default(""),
    state_note_en: text(200).default(""),
    state_role_mr: text(120).default(""),
    state_role_en: text(120).default(""),
    eyebrow_dot: z.boolean().default(true),
  }),
  // Order is display order: a contact's card is sorted by where its role sits
  // in this list, so moving a row here reorders the page.
  roles: z.array(roleSchema).min(1, "At least one role is required").max(15).superRefine(uniqueIds),
  links: z.object({
    official_url: linkUrl,
    submit_form_url: linkUrl,
    // Indian mobile number, or empty to drop the footer note's phone link.
    state_phone: z
      .string()
      .trim()
      .max(15)
      .refine((v) => v === "" || /^[0-9]{10}$/.test(v), "Enter a 10-digit mobile number")
      .default(""),
  }),
});

export function parseDirectory(body) {
  return directorySchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
