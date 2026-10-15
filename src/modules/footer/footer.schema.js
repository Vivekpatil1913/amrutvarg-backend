import { z } from "zod";
import { SOCIAL_ICON_VALUES, LINK_ICONS } from "./footer.defaults.js";

// Server-side rules for the official links and social profiles.
//
// The admin form applies the same limits so mistakes surface early, but this is
// what decides: a crafted request cannot store a link that is not a real
// address, an icon the site cannot draw, or a title the footer column has no
// room for.

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

// Only http(s) and only an absolute URL: these open in a new tab, so a
// "javascript:" or a relative string reaching the published site would be
// either dangerous or broken. Empty is allowed and means "not set".
const linkUrl = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (/^www\./i.test(v) ? `https://${v}` : v))
  .refine((v) => v.length <= 300, "URL must be 300 characters or fewer")
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a full http:// or https:// address")
  .default("");

const officialLink = z.object({
  id: itemId,
  // Required here, unlike a social profile: an official link with no address is
  // a row with nothing to show, where a blank social profile just hides an icon.
  url: linkUrl.refine((v) => v !== "", "A link address is required"),
  icon: z.enum(LINK_ICONS, { errorMap: () => ({ message: "Choose one of the available icons" }) }),
  title_mr: required(120, "Marathi title"),
  title_en: text(120).default(""),
  desc_mr: text(300).default(""),
  desc_en: text(300).default(""),
  enabled: z.boolean().default(true),
});

const socialProfile = z.object({
  id: itemId,
  platform: required(40, "Platform name"),
  // Optional for existing records; new profiles choose a built-in icon.
  icon: z.enum(SOCIAL_ICON_VALUES, { errorMap: () => ({ message: "Choose one of the available icons" }) }).optional(),
  url: linkUrl,
  // Overrides the screen-reader name, which otherwise comes from the platform.
  label_mr: text(60).default(""),
  label_en: text(60).default(""),
  enabled: z.boolean().default(true),
});

export const footerSchema = z.object({
  text: z.object({
    official_heading_mr: text(80).default(""),
    official_heading_en: text(80).default(""),
    social_heading_mr: text(80).default(""),
    social_heading_en: text(80).default(""),
  }),
  links: z.array(officialLink).max(8, "At most 8 official links").default([]).superRefine(uniqueIds),
  social: z
    .array(socialProfile)
    .max(30, "At most 30 social profiles")
    .default([])
    .superRefine(uniqueIds),
});

export function parseFooter(body) {
  return footerSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
