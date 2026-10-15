import { z } from "zod";
import { ICONS } from "../hero/hero.defaults.js";
import { ACTION_VALUES } from "./join.defaults.js";

// Server-side rules for the Join section.
//
// The admin form applies the same limits so mistakes surface early, but this is
// what decides: a crafted request cannot store a blank required title, an icon
// the site cannot draw, an action no handler is wired to, or text past what the
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

// Only http(s) and only an absolute URL: the link opens in a new tab, so a
// "javascript:" or a relative string reaching the published site would be
// either dangerous or broken.
const linkUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => v === "" || /^https?:\/\/\S+$/i.test(v),
    "Enter a full http:// or https:// address"
  )
  .default("");

const needSchema = z.object({
  id: itemId,
  label_mr: required(60, "Marathi label"),
  label_en: text(60).default(""),
});

const cardSchema = z
  .object({
    id: itemId,
    action: z.enum(ACTION_VALUES, { errorMap: () => ({ message: "Choose one of the available actions" }) }),
    icon: z.enum(ICONS),
    action_icon: z.enum(ICONS),
    title_mr: required(120, "Marathi title"),
    title_en: text(120).default(""),
    desc_mr: text(600).default(""),
    desc_en: text(600).default(""),
    // Up to eight chips: past that the row wraps into the button and the card
    // layout breaks. An empty list simply hides the block.
    needs: z.array(needSchema).max(8, "At most 8 required-detail chips").default([]).superRefine(uniqueIds),
    note_mr: text(400).default(""),
    note_en: text(400).default(""),
    link_note_mr: text(400).default(""),
    link_note_en: text(400).default(""),
    link_label_mr: text(80).default(""),
    link_label_en: text(80).default(""),
    link_url: linkUrl,
    action_mr: required(80, "Marathi button label"),
    action_en: text(80).default(""),
    enabled: z.boolean().default(true),
  })
  // A link needs all three parts to render. Half-filled is a mistake worth
  // catching here rather than shipping a bare URL or a label that goes nowhere.
  .superRefine((card, ctx) => {
    const hasUrl = card.link_url !== "";
    const hasLabel = card.link_label_mr !== "";
    if (hasUrl && !hasLabel) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A link address needs a Marathi link label", path: ["link_label_mr"] });
    }
    if (hasLabel && !hasUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A link label needs a link address", path: ["link_url"] });
    }
  });

export const joinSchema = z.object({
  text: z.object({
    badge_mr: text(80).default(""),
    badge_en: text(80).default(""),
    title_mr: required(160, "Marathi heading"),
    title_en: text(160).default(""),
    lead_mr: text(400).default(""),
    lead_en: text(400).default(""),
    needs_label_mr: text(80).default(""),
    needs_label_en: text(80).default(""),
    eyebrow_dot: z.boolean().default(true),
  }),
  cards: z.array(cardSchema).min(1, "At least one card is required").max(6).superRefine(uniqueIds),
});

export function parseJoin(body) {
  return joinSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
