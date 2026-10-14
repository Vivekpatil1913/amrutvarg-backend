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

const isRealDate = (v) => ISO_DATE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());
const isPastDate = (v) => new Date(`${v}T00:00:00`) < new Date(new Date().toDateString());

const required = (label) => z.string().trim().min(1, `${label} is required`);
const optionalText = z.string().trim().optional();

const dateOfBirth = z
  .string()
  .refine(isRealDate, "Enter a valid date")
  .refine(isPastDate, "Date of birth must be in the past");

const mobile = (label) => z.string().trim().regex(MOBILE, `${label} must be a valid 10-digit mobile number`);

// An optional field is only checked when the visitor actually filled it in,
// matching `v.field.trim() && !isValid(...)` in the browser.
const optionalMatching = (re, message) =>
  z.string().trim().optional().refine((v) => !v || re.test(v), { message });

// ── Participant ──────────────────────────────────────────────────────────────
// The browser sends a different payload per category: a school registration
// carries only the short form's keys and course === 'SCHOOL_STUDENT'.

const schoolParticipant = z.object({
  amrutVargId: z.union([z.number(), z.string()]).nullable().optional(),
  name: required("Name"),
  gender: z.enum(GENDERS),
  dateOfBirth,
  course: z.literal("SCHOOL_STUDENT"),
  standard: z.union([z.string().trim().min(1), z.number()]),
  parentGuardianName: required("Parent or guardian name"),
  declarationAccepted: z.literal(true),
});

const collegeParticipant = z.object({
  amrutVargId: z.union([z.number(), z.string()]).nullable().optional(),
  name: required("Name"),
  mobile: mobile("Mobile"),
  education: required("Education"),
  gender: z.enum(GENDERS),
  dateOfBirth,
  bloodGroup: optionalText,
  whatsappNumber: optionalMatching(MOBILE, "WhatsApp number must be a valid 10-digit mobile number"),
  email: optionalMatching(EMAIL, "Enter a valid email address"),
  course: z.enum(COLLEGE_COURSES),
  academicYear: z.coerce.number().int(),
  semester: z.coerce.number().int(),
  rollNumber: optionalText,
  address: required("Address"),
  parentGuardianName: required("Parent or guardian name"),
  cityTaluka: required("City or taluka"),
  district: required("District"),
  pinCode: z.string().trim().regex(PIN, "Enter a valid 6-digit PIN code"),
  languagesKnown: z.array(z.string()).default([]),
  otherLanguage: optionalText,
  skills: optionalText,
  emergencyContactName: required("Emergency contact name"),
  emergencyContactRelationship: required("Emergency contact relationship"),
  emergencyContactPhone: mobile("Emergency contact phone"),
  declarationAccepted: z.literal(true),
}).refine(
  (v) => !v.languagesKnown.includes("OTHER") || Boolean(v.otherLanguage),
  { message: "Specify the other language", path: ["otherLanguage"] }
);

// Branch on the same signal the browser uses to build the payload.
export const participantSchema = z.union([schoolParticipant, collegeParticipant]);

// ── Organizer ────────────────────────────────────────────────────────────────

export const organizerSchema = z.object({
  name: required("Name"),
  place: required("Place"),
  mobile: mobile("Mobile"),
  designation: required("Designation"),
  district: required("District"),
});

// ── Leader ───────────────────────────────────────────────────────────────────
// Posted as multipart, so every value arrives as a string and numbers are
// coerced rather than expected.

export const leaderSchema = z.object({
  leaderName: required("Leader name"),
  institutionName: required("Institution name"),
  institutionEmail: optionalMatching(EMAIL, "Enter a valid email address"),
  institutionPhone: optionalMatching(PHONE, "Enter a valid phone number"),
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
  specialNote: optionalText,
  organizerEnrollment: optionalText,
});

export const SUBMISSION_SCHEMAS = {
  participant: participantSchema,
  organizer: organizerSchema,
  leader: leaderSchema,
};
