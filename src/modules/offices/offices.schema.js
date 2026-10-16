import { z } from "zod";
import { isSafeHttpUrl, MAX_URL_LENGTH } from "../../lib/mediaUrl.js";
import { normalisePhone } from "../contacts/contacts.schema.js";

// Field rules for one district's office.
//
// Every detail is optional. That is deliberate rather than lax: this record
// exists so VERIFIED information can be published, and a half-known office is
// a normal state — the Collector's name may be confirmed long before the
// working hours are. The public page renders only what is filled in, so an
// empty field costs nothing and a guessed one would cost a great deal.
//
// The one required field is the district, because an office with no district
// belongs nowhere.

export const MAX = {
  officeName: 200,
  collector: 200,
  designation: 150,
  address: 500,
  phone: 20,
  email: 200,
  hours: 200,
};

const optionalText = (max, label) =>
  z.string().trim().max(max, `${label} cannot exceed ${max} characters`).optional().default("");

// Deliberately not the "one true" email regex — it rejects what a reader would
// call malformed and leaves the rest to the server that will actually deliver.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// An official address a browser can open. Empty is fine; a javascript: URL is
// not, and never reaches an href.
const optionalUrl = (label) =>
  z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, `${label} cannot exceed ${MAX_URL_LENGTH} characters`)
    .optional()
    .default("")
    .refine((v) => v === "" || isSafeHttpUrl(v), "Enter a complete http:// or https:// address");

export const officeSchema = z
  .object({
    district_id: z.number().int().positive("Choose a district"),

    office_name_mr: optionalText(MAX.officeName, "Office name (Marathi)"),
    office_name_en: optionalText(MAX.officeName, "Office name (English)"),

    collector_name: optionalText(MAX.collector, "Collector name"),
    collector_designation: optionalText(MAX.designation, "Designation"),

    address: optionalText(MAX.address, "Address"),

    // Stored as ten digits, the way district_contacts stores them, so the site
    // renders one kind of tel: link throughout.
    phone: z
      .string()
      .trim()
      .max(MAX.phone, `Cannot exceed ${MAX.phone} characters`)
      .optional()
      .default("")
      .refine(
        (v) => v === "" || /^[0-9]{10}$/.test(normalisePhone(v)),
        "Enter a 10-digit phone number, or leave it empty"
      )
      .transform((v) => (v === "" ? "" : normalisePhone(v))),

    email: optionalText(MAX.email, "Email").refine(
      (v) => v === "" || EMAIL.test(v),
      "Enter a valid email address"
    ),

    hours: optionalText(MAX.hours, "Working hours"),
    website_url: optionalUrl("Website"),
    map_url: optionalUrl("Map link"),

    is_active: z.boolean().optional().default(true),
  })
  .superRefine((d, ctx) => {
    // A row with a district and nothing else publishes nothing, which is
    // indistinguishable from having no row — and leaves a district looking
    // like it has an office page when it has no information at all.
    const details = [
      d.office_name_mr, d.office_name_en, d.collector_name, d.collector_designation,
      d.address, d.phone, d.email, d.hours, d.website_url, d.map_url,
    ];
    if (details.every((v) => !v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["office_name_mr"],
        message: "Fill in at least one office detail — an empty office is not published",
      });
    }
  });
