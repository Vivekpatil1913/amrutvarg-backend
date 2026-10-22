import { z } from "zod";
import { isSafeHttpUrl, MAX_URL_LENGTH } from "../../lib/mediaUrl.js";

// Field rules for an Amrut Varg — the record that describes one school.
//
// Extracted so the rules can be exercised without a database, the way the
// other modules do it. The relationship checks (district belongs to vibhag,
// taluka belongs to district) need the masters and live in the route; this
// file is only about the shape and limits of the fields themselves.
//
// The admin form applies the same limits so mistakes surface while typing, but
// this is what decides.

export const MAX = {
  geo: 100,
  village: 120,
  school: 300,
  varg: 200,
  coordinator: 200,
  enrollment: 100000,
};

// Trimmed before the length is measured, so "   " is an empty value rather
// than a three-character one — which is what a bare .min(1) used to call it,
// letting a whitespace-only school name through.
const requiredText = (max, label) =>
  z.string().trim()
    .min(1, `${label} is required`)
    .max(max, `${label} cannot exceed ${max} characters`);

const optionalText = (max, label) =>
  z.string().trim().max(max, `${label} cannot exceed ${max} characters`).optional().default("");

// A master row id. Null, "" and absent all mean "not chosen"; anything else
// has to be a real positive integer before it is allowed near a query.
const optionalId = z
  .union([z.number().int().positive(), z.literal(null), z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const vargSchema = z.object({
  vibhag_mr: requiredText(MAX.geo, "Division"),
  vibhag_en: optionalText(MAX.geo, "Division (English)"),
  district_mr: requiredText(MAX.geo, "District"),
  district_en: optionalText(MAX.geo, "District (English)"),

  // Optional because the taluka master covers only a fraction of Maharashtra;
  // requiring it would make most districts impossible to file a school under.
  taluka: optionalText(MAX.geo, "Taluka"),

  // Stable references alongside the names. Optional, so the public
  // registration forms and any older client that posts names alone keep
  // working unchanged. Where they ARE sent, the route treats them as
  // authoritative and derives the names from them.
  district_id: optionalId,
  taluka_id: optionalId,

  // Free text, and deliberately not restricted to a character range: these
  // names are Marathi, and an ASCII-only rule would reject most of them.
  // Trimming is what makes a whitespace-only entry read as empty rather than
  // being stored as blanks.
  village: optionalText(MAX.village, "Village name"),

  school_name: requiredText(MAX.school, "School name"),
  varg_name: optionalText(MAX.varg, "Varg name"),
  coordinator_name: optionalText(MAX.coordinator, "Coordinator name"),

  enrollment_count: z.number().int().min(0).max(MAX.enrollment).optional().default(0),
  is_active: z.boolean().optional().default(true),
  display_order: z.number().int().optional().default(0),

  // An optional introduction video or website for the school. Optional by
  // design — most records have none — but when given it has to be an address
  // a browser can actually open, so javascript: and friends never reach a href.
  resource_url: z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, `Cannot exceed ${MAX_URL_LENGTH} characters`)
    .optional()
    .default("")
    .refine((v) => v === "" || isSafeHttpUrl(v), "Enter a complete http:// or https:// address"),
});
