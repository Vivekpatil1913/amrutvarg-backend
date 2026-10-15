import { z } from "zod";

// Field rules for a district contact.
//
// The admin form applies the same limits so mistakes surface early, but this is
// what decides: a crafted request cannot store a blank name, an address that is
// not an email, or a phone number the site would render as a dead tel: link.
//
// Relationships — that the division is a real vibhag, that each district
// belongs to it, that the role exists in the Directory section — need the
// database and are checked in the route.

// Digits only, with an optional country code removed. The length test is what
// decides a "91" prefix is a country code: 9112227668 is itself a valid
// ten-digit number, and stripping its leading 91 would quietly corrupt it.
export const normalisePhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(3);
  return digits;
};

const optionalText = (max) => z.string().trim().max(max, `Cannot exceed ${max} characters`);
const requiredText = (max, label) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} cannot exceed ${max} characters`);

export const contactSchema = z.object({
  division_mr: requiredText(100, "Division (Marathi)"),
  division_en: optionalText(100).default(""),
  role: requiredText(50, "Role").regex(/^[a-zA-Z0-9_-]+$/, "Invalid role"),
  // Blank entries and duplicates are dropped rather than rejected: they come
  // from how the list is typed, not from a decision worth stopping a save for.
  districts: z
    .array(optionalText(100))
    .max(40, "At most 40 districts")
    .default([])
    .transform((list) => [...new Set(list.filter(Boolean))]),
  name: requiredText(200, "Name"),
  email: optionalText(200)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address")
    .default(""),
  phone: optionalText(20)
    .transform(normalisePhone)
    .refine((v) => v === "" || /^[0-9]{10}$/.test(v), "Enter a 10-digit mobile number")
    .default(""),
  is_active: z.boolean().default(true),
  display_order: z.coerce
    .number({ invalid_type_error: "Display order must be a number" })
    .int("Display order must be a whole number")
    .min(0, "Display order cannot be negative")
    .max(9999, "Display order cannot exceed 9999")
    .default(0),
});

export function parseContact(body) {
  return contactSchema.safeParse(body);
}

export function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}
