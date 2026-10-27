import { z } from "zod";
import { isSafeHttpUrl, MAX_URL_LENGTH } from "../../lib/mediaUrl.js";

// Field rules for an Amrut Varg Melawa announcement. Jurisdiction rules — who
// may announce at which level — need the caller and the masters, and live in
// the route.

export const SCOPES = ["STATE", "DIVISION", "DISTRICT"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const isRealDate = (v) => {
  if (!ISO_DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const minutesOf = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const text = (label, max, min = 0) => {
  const base = z.string().trim().max(max, `${label} cannot exceed ${max} characters`);
  return min ? base.min(min, `${label} is required`) : base.optional().default("");
};

const optionalId = z
  .union([z.coerce.number().int().positive(), z.literal(null), z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const melawaSchema = z.object({
  title_mr: text("Title (Marathi)", 200, 3),
  title_en: text("Title (English)", 200),
  event_date: z.string().trim().refine(isRealDate, "Enter a valid event date"),
  end_date: z.union([z.string().trim().refine(isRealDate, "Enter a valid end date"), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  start_time: z.string().trim().regex(CLOCK, "Enter a start time as HH:MM"),
  end_time: z.string().trim().regex(CLOCK, "Enter an end time as HH:MM"),
  venue_mr: text("Venue (Marathi)", 500, 3),
  venue_en: text("Venue (English)", 500),
  maps_url: z.string().trim().max(MAX_URL_LENGTH).optional().default("")
    .refine((v) => v === "" || isSafeHttpUrl(v), "Enter a complete http:// or https:// map link"),
  jurisdiction_scope: z.enum(SCOPES),
  target_division_id: optionalId,
  target_district_id: optionalId,
  highlights_mr: text("Highlights (Marathi)", 4000),
  highlights_en: text("Highlights (English)", 4000),
  is_active: z.boolean().optional().default(true),
})
  .refine((v) => !v.end_date || v.end_date >= v.event_date, {
    message: "End date cannot be before the event date", path: ["end_date"],
  })
  // On a single-day event the end time has to be after the start time; on a
  // multi-day one it is the last day's closing time and may be earlier.
  .refine((v) => (v.end_date && v.end_date > v.event_date) || minutesOf(v.end_time) > minutesOf(v.start_time), {
    message: "End time must be after the start time", path: ["end_time"],
  })
  .refine((v) => v.jurisdiction_scope !== "DIVISION" || v.target_division_id, {
    message: "Choose the division", path: ["target_division_id"],
  })
  .refine((v) => v.jurisdiction_scope !== "DISTRICT" || v.target_district_id, {
    message: "Choose the district", path: ["target_district_id"],
  });
