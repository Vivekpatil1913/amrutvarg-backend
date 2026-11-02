import { z } from "zod";

// Field rules for an Amrut Varg activity record, submitted from the public
// 'Amrut Varg' portal as multipart form data — every value arrives as a
// string, so numbers are coerced here.
//
// The relationship checks (district belongs to division, taluka belongs to
// district) and the photo rules need the database and the uploaded files, and
// live in the route. The public form applies the same limits while typing.

export const MAX = {
  taluka: 100,
  institution: 300,
  incharge: 200,
  description: 2000,
  participants: 100000,
};

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"];

const requiredText = (max, label) =>
  z.string({ required_error: `${label} is required` }).trim()
    .min(1, `${label} is required`)
    .max(max, `${label} cannot exceed ${max} characters`);

const requiredId = (label) =>
  z.coerce.number({ invalid_type_error: `${label} is required` })
    .int(`${label} is required`)
    .positive(`${label} is required`);

const optionalId = z
  .union([z.literal(""), z.literal(null), z.coerce.number().int().positive()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

export const activitySchema = z.object({
  division_id: requiredId("Division"),
  district_id: requiredId("District"),
  // A taluka is picked from the master where the master covers the district,
  // and typed otherwise; the name is always stored.
  taluka_id: optionalId,
  taluka: requiredText(MAX.taluka, "Taluka"),
  institution_name: requiredText(MAX.institution, "School / institution name"),
  incharge_name: requiredText(MAX.incharge, "Amrut Varg Pramukh name"),
  incharge_mobile: z.string().trim().optional().default("")
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number"),
  participant_count: z.string().trim()
    .regex(/^\d+$/, "Enter the number of students as a whole number")
    .transform(Number)
    .pipe(z.number().int().min(1, "There must be at least one student").max(MAX.participants, `Cannot exceed ${MAX.participants}`)),
  frequency: z.enum(FREQUENCIES, {
    errorMap: () => ({ message: "Choose Daily, Weekly or Monthly" }),
  }),
  description: z.string().trim().max(MAX.description, `Description cannot exceed ${MAX.description} characters`).optional().default(""),
});

// Filters shared by the public repository, the admin list and the CSV export,
// so an export always holds exactly the rows the list shows.
export const filterSchema = z.object({
  division_id: z.union([z.literal(""), z.coerce.number().int().positive()]).optional().default(""),
  district_id: z.union([z.literal(""), z.coerce.number().int().positive()]).optional().default(""),
  frequency: z.union([z.literal(""), z.enum(FREQUENCIES)]).optional().default(""),
  search: z.string().trim().max(200).optional().default(""),
});

// One CSV cell. Quotes are doubled, and a value a spreadsheet would read as a
// formula (=, +, -, @, tab, CR) is prefixed with an apostrophe so an exported
// name can never execute in Excel.
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (header, rows) =>
  [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
