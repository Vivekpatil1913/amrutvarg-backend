import { z } from "zod";

// Server-side mirror of the browser's validation rules.
//
// Every rule here is copied field-for-field from the frontend validators so a
// form that passes in the browser always passes here: the regexes come from
// src/services/validation.js and the required sets from each form's validate().
// Nothing was tightened or relaxed — this closes the gap where arbitrary JSON
// could be posted straight to the public endpoints.

const MOBILE = /^[6-9]\d{9}$/;
const PHONE = /^[0-9+\-\s()]{6,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN = /^[1-9]\d{5}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_PARTICIPANTS = 100000;
const MAX_VARGS = 10000;

const GENDERS = ["MALE", "FEMALE", "OTHER"];
const COLLEGE_COURSES = ["BBA", "BCA", "BTECH_COSMETICS", "BSC_IT"];

const isRealDate = (v) => {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  const [year, month, day] = v.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const isPastDate = (v) => new Date(`${v}T00:00:00`) < new Date(new Date().toDateString());

const required = (label, max = 255) => z.string().trim().min(1, `${label} is required`).max(max, `${label} cannot exceed ${max} characters`);
const optionalText = (max = 2000) => z.string().trim().max(max, `Cannot exceed ${max} characters`).optional();

const dateOfBirth = z
  .string()
  .refine(isRealDate, "Enter a valid date")
  .refine(isPastDate, "Date of birth must be in the past");

const mobile = (label) => z.string().trim().regex(MOBILE, `${label} must be a valid 10-digit mobile number`);

const validPhone = (v) => PHONE.test(v) && (v.match(/\d/g) || []).length >= 7 && (v.match(/\d/g) || []).length <= 15;

// An optional field is only checked when the visitor actually filled it in,
// matching `v.field.trim() && !isValid(...)` in the browser.
const optionalMatching = (re, message) =>
  z.string().trim().optional().refine((v) => !v || re.test(v), { message });

// ── Participant ──────────────────────────────────────────────────────────────
// The browser sends a different payload per category: a school registration
// carries only the short form's keys and course === 'SCHOOL_STUDENT'.

const schoolParticipant = z.object({
  amrutVargId: z.number().int().positive().nullable().optional(),
  name: required("Name"),
  gender: z.enum(GENDERS),
  dateOfBirth,
  course: z.literal("SCHOOL_STUDENT"),
  standard: z.enum(Array.from({ length: 12 }, (_, i) => String(i + 1))),
  parentGuardianName: required("Parent or guardian name"),
  declarationAccepted: z.literal(true),
});

const collegeParticipant = z.object({
  amrutVargId: z.number().int().positive().nullable().optional(),
  name: required("Name"),
  mobile: mobile("Mobile"),
  education: required("Education"),
  gender: z.enum(GENDERS),
  dateOfBirth,
  bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional().or(z.literal("")),
  whatsappNumber: optionalMatching(MOBILE, "WhatsApp number must be a valid 10-digit mobile number"),
  email: optionalMatching(EMAIL, "Enter a valid email address"),
  course: z.enum(COLLEGE_COURSES),
  academicYear: z.coerce.number().int().min(1).max(4),
  semester: z.coerce.number().int().min(1).max(4),
  rollNumber: optionalText(50),
  address: required("Address", 500),
  parentGuardianName: required("Parent or guardian name"),
  cityTaluka: required("City or taluka"),
  district: required("District"),
  pinCode: z.string().trim().regex(PIN, "Enter a valid 6-digit PIN code"),
  languagesKnown: z.array(z.enum(["MARATHI", "HINDI", "ENGLISH", "OTHER"])).max(4).default([]),
  otherLanguage: optionalText(100),
  skills: optionalText(2000),
  emergencyContactName: required("Emergency contact name"),
  emergencyContactRelationship: required("Emergency contact relationship", 100),
  emergencyContactPhone: mobile("Emergency contact phone"),
  declarationAccepted: z.literal(true),
}).refine(
  (v) => !v.languagesKnown.includes("OTHER") || Boolean(v.otherLanguage),
  { message: "Specify the other language", path: ["otherLanguage"] }
);

// Branch on the same signal the browser uses to build the payload.
export const participantSchema = z.union([schoolParticipant, collegeParticipant]);

// ── Organizer ────────────────────────────────────────────────────────────────

// The organiser is an institution, so the record names three things: the body
// itself, whoever is running the varg, and whoever answers the phone. Those
// are often different people, which is why the name is not one field.
//
// `place` is deliberately absent. It used to be required and meant a town;
// what the form now asks for is the organisation, which is a different fact
// rather than a reworded one. Submissions made before this keep their stored
// `place` — the column is JSONB and nothing rewrites it — and the admin still
// has a label for it so those records read correctly.
//
// `vargName` is the same fact the admin form calls "Varg Name" and stores in
// vargs.varg_name, so a listing reads the same whichever side created it. It
// replaces `organisation`; a client still posting the old key (a cached
// bundle) is mapped across rather than rejected.
export const VARG_NAME_MAX = 200;

const legacyOrganizerKeys = (v) => {
  if (!v || typeof v !== "object" || v.vargName !== undefined || v.organisation === undefined) return v;
  const { organisation, ...rest } = v;
  return { ...rest, vargName: organisation };
};

export const organizerSchema = z.preprocess(legacyOrganizerKeys, z.object({
  name: required("Organizer name"),
  vargName: z.string({ required_error: "A Varg name is required" }).trim()
    .min(1, "A Varg name is required")
    .max(VARG_NAME_MAX, `Varg name cannot exceed ${VARG_NAME_MAX} characters`),
  // Optional: a single school or housing society has no branch to give, and
  // forcing one would mean inventing it.
  branch: optionalText(255),
  contactPerson: required("Contact person name"),
  designation: required("Designation"),
  mobile: mobile("Mobile"),
  district: required("District"),
}));

// ── Leader ───────────────────────────────────────────────────────────────────
// Posted as multipart, so every value arrives as a string and numbers are
// coerced rather than expected.

export const leaderSchema = z.object({
  leaderName: required("Leader name"),
  institutionName: required("Institution name", 500),
  institutionEmail: optionalMatching(EMAIL, "Enter a valid email address"),
  institutionPhone: z.string().trim().max(20).optional().refine((v) => !v || validPhone(v), { message: "Enter a valid phone number" }),
  district: required("District"),
  division: required("Division"),
  taluka: required("Taluka"),
  village: required("Village"),
  coordinatorName: required("Coordinator name"),
  coordinatorPhone: mobile("Coordinator phone"),
  coordinatorPhoneAlt: optionalMatching(MOBILE, "Alternate phone must be a valid 10-digit mobile number"),
  vargDate: z.string().refine(isRealDate, "Enter a valid date"),
  participantCount: z.coerce
    .number({ invalid_type_error: "Enter a whole number" })
    .int("Enter a whole number")
    .min(0, "Enter a whole number")
    .max(MAX_PARTICIPANTS, `Must not exceed ${MAX_PARTICIPANTS}`),
  vargCount: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Enter a whole number")
      .min(0, "Enter a whole number")
      .max(MAX_VARGS, `Must not exceed ${MAX_VARGS}`)
      .optional()
  ),
  specialNote: optionalText(2000),
  organizerEnrollment: optionalText(5000),
});

export const SUBMISSION_SCHEMAS = {
  participant: participantSchema,
  organizer: organizerSchema,
  leader: leaderSchema,
};
