import { z } from "zod";

// Field rules for the public suggestion / complaint form. The browser applies
// the same rules (src/services/validation.js in the frontend) so mistakes show
// while typing; this is what decides.

export const SUBMISSION_TYPES = ["SUGGESTION", "COMPLAINT"];
export const STATUSES = ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"];

// RFC 5322 addr-spec, as commonly transcribed: dot-atom or quoted local part,
// and a hostname or bracketed IP literal for the domain.
export const EMAIL_RFC5322 =
  /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;

// Indian mobile: ten digits, starting 6-9.
export const MOBILE = /^[6-9]\d{9}$/;

// Letters only, in any script — most names here are written in Devanagari,
// which an a-z rule would reject. Combining marks (matras) count as part of a
// letter; spaces and dots separate words and initials.
export const NAME = /^[\p{L}\p{M}]+(?:(?:\.\s*|\s+)[\p{L}\p{M}]+)*\.?$/u;

export const LIMITS = {
  nameMin: 3, nameMax: 100,
  subjectMin: 5, subjectMax: 120,
  descriptionMin: 20, descriptionMax: 2000,
  photoMaxBytes: 3 * 1024 * 1024,
  videoMaxBytes: 20 * 1024 * 1024,
  maxPhotos: 5,
  notesMin: 10, notesMax: 4000,
};

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

const id = (label) =>
  z.coerce
    .number({ invalid_type_error: `${label} is required` })
    .int(`${label} is required`)
    .positive(`${label} is required`);

const length = (label, min, max) =>
  z.string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} cannot exceed ${max} characters`);

export const grievanceSchema = z.object({
  submission_type: z.enum(SUBMISSION_TYPES, {
    errorMap: () => ({ message: "Choose Suggestion or Complaint" }),
  }),
  division_id: id("Division"),
  district_id: id("District"),
  full_name: length("Full name", LIMITS.nameMin, LIMITS.nameMax)
    .refine((v) => NAME.test(v), "Name may contain letters only"),
  email: z.string({ required_error: "Email is required" }).trim().max(254, "Email is too long")
    .refine((v) => EMAIL_RFC5322.test(v), "Enter a valid email address"),
  mobile_number: z.string({ required_error: "Mobile number is required" }).trim()
    .refine((v) => MOBILE.test(v), "Enter a valid 10-digit mobile number starting with 6-9"),
  subject: length("Subject", LIMITS.subjectMin, LIMITS.subjectMax),
  description: length("Description", LIMITS.descriptionMin, LIMITS.descriptionMax),
});

// Which statuses a ticket may move to from each status. RESOLVED can be
// reopened while the complainant has not yet been told it is closed.
export const TRANSITIONS = {
  NEW: ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
};

export const statusUpdateSchema = z.object({
  status: z.enum(STATUSES),
  note: z.string().trim().max(LIMITS.notesMax).optional().default(""),
  action_taken_notes: z.string().trim().max(LIMITS.notesMax).optional().default(""),
});

/**
 * Checks a requested status change against the ticket as it stands.
 * Returns [] when allowed, or field issues in the project's usual shape.
 *
 * Moving to RESOLVED needs Action Taken Notes in the request itself; closing a
 * ticket that was already resolved may rely on the notes already recorded.
 */
export function checkTransition(current, { status, action_taken_notes }) {
  if (current.status === status) {
    return [{ field: "status", message: `The ticket is already ${status}` }];
  }
  if (!(TRANSITIONS[current.status] || []).includes(status)) {
    return [{ field: "status", message: `A ${current.status} ticket cannot be moved to ${status}` }];
  }
  if (status === "RESOLVED" || status === "CLOSED") {
    const notes = action_taken_notes || (status === "CLOSED" ? current.action_taken_notes : "");
    if (!notes || notes.trim().length < LIMITS.notesMin) {
      return [{
        field: "action_taken_notes",
        message: `Action Taken Notes (at least ${LIMITS.notesMin} characters) are required before a ticket can be ${status.toLowerCase()}`,
      }];
    }
  }
  return [];
}

export const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5").max(5, "Choose a rating from 1 to 5"),
  comment: z.string().trim().max(1000, "Cannot exceed 1000 characters").optional().default(""),
});

export const ticketNumber = (id, createdAt = new Date()) =>
  `AV-${new Date(createdAt).getFullYear()}-${String(id).padStart(6, "0")}`;
