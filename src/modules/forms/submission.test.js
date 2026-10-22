// Regression guard for the server-side submission rules.
//
// The payloads below are the exact shapes the three form components build in
// toPayload(). Every one of them MUST pass: if a test here fails, the server is
// rejecting something the website considers valid, which would silently lose a
// real registration.

import test from "node:test";
import assert from "node:assert/strict";
import { participantSchema, organizerSchema, leaderSchema } from "./submission.schema.js";

const ok = (schema, payload, label) => {
  const r = schema.safeParse(payload);
  assert.equal(r.success, true, `${label} should pass: ${JSON.stringify(r.error?.issues)}`);
};
const rejects = (schema, payload, label) => {
  assert.equal(schema.safeParse(payload).success, false, `${label} should be rejected`);
};

// ── Baseline payloads, copied from the components ───────────────────────────

const schoolParticipant = {
  amrutVargId: 12,
  name: "सुमित पाटील",
  gender: "MALE",
  dateOfBirth: "2010-05-14",
  course: "SCHOOL_STUDENT",
  standard: "8",
  parentGuardianName: "रमेश पाटील",
  declarationAccepted: true,
};

const collegeParticipant = {
  amrutVargId: 12,
  name: "प्रिया देशमुख",
  mobile: "9876543210",
  education: "BCA",
  gender: "FEMALE",
  dateOfBirth: "2004-02-09",
  bloodGroup: "B+",
  whatsappNumber: "9876543210",
  email: "priya@example.com",
  course: "BCA",
  academicYear: 2,
  semester: 3,
  rollNumber: "BCA-221",
  address: "१२ शिवाजी नगर",
  parentGuardianName: "अनिल देशमुख",
  cityTaluka: "हवेली",
  district: "पुणे",
  pinCode: "411001",
  languagesKnown: ["MARATHI", "HINDI"],
  skills: "संगणक",
  emergencyContactName: "अनिल देशमुख",
  emergencyContactRelationship: "वडील",
  emergencyContactPhone: "9812345678",
  declarationAccepted: true,
};

// The organiser is an institution, so three names appear: the body, whoever
// runs the varg, and whoever answers the phone.
const organizer = {
  organisation: "श्री. एकात्म विद्यालय",
  branch: "कोथरूड शाखा",
  name: "संजय कुलकर्णी",
  contactPerson: "मीना देशपांडे",
  designation: "मुख्याध्यापक",
  mobile: "9876543210",
  district: "पुणे",
};

// Multipart: every value reaches the server as a string.
const leader = {
  leaderName: "विनायक जोशी",
  institutionName: "नवभारत विद्यालय",
  institutionEmail: "school@example.com",
  institutionPhone: "020-25551234",
  district: "पुणे",
  division: "पुणे",
  taluka: "हवेली",
  village: "वडगाव",
  coordinatorName: "सुरेश शिंदे",
  coordinatorPhone: "9876543210",
  coordinatorPhoneAlt: "9812345678",
  vargDate: "2026-06-15",
  participantCount: "120",
  vargCount: "3",
  specialNote: "सकाळी ७ वाजता",
  organizerEnrollment: "ORG-99",
};

// ── The payloads the website actually sends must all pass ───────────────────

test("school participant payload passes", () => ok(participantSchema, schoolParticipant, "school"));
test("college participant payload passes", () => ok(participantSchema, collegeParticipant, "college"));
test("organizer payload passes", () => ok(organizerSchema, organizer, "organizer"));
test("leader payload passes", () => ok(leaderSchema, leader, "leader"));

test("optional participant fields may be omitted entirely", () => {
  const minimal = { ...collegeParticipant };
  delete minimal.bloodGroup;
  delete minimal.whatsappNumber;
  delete minimal.email;
  delete minimal.rollNumber;
  delete minimal.skills;
  ok(participantSchema, minimal, "college without optionals");
});

test("optional leader fields may be omitted (FormData drops empty values)", () => {
  const minimal = { ...leader };
  delete minimal.institutionEmail;
  delete minimal.institutionPhone;
  delete minimal.coordinatorPhoneAlt;
  delete minimal.vargCount;
  delete minimal.specialNote;
  delete minimal.organizerEnrollment;
  ok(leaderSchema, minimal, "leader without optionals");
});

test("participant with OTHER language and a value passes", () => {
  ok(participantSchema, {
    ...collegeParticipant,
    languagesKnown: ["MARATHI", "OTHER"],
    otherLanguage: "कन्नड",
  }, "other language");
});

// ── The rules the browser enforces are enforced here too ────────────────────

test("missing required name is rejected", () => {
  const { name, ...rest } = collegeParticipant;
  rejects(participantSchema, rest, "no name");
});

test("invalid mobile is rejected", () => {
  rejects(participantSchema, { ...collegeParticipant, mobile: "12345" }, "short mobile");
  rejects(participantSchema, { ...collegeParticipant, mobile: "1234567890" }, "mobile not starting 6-9");
  rejects(organizerSchema, { ...organizer, mobile: "0000000000" }, "organizer mobile");
});

test("invalid email is rejected but a blank one is not", () => {
  rejects(participantSchema, { ...collegeParticipant, email: "not-an-email" }, "bad email");
  ok(participantSchema, { ...collegeParticipant, email: "" }, "blank email");
});

test("invalid PIN code is rejected", () => {
  rejects(participantSchema, { ...collegeParticipant, pinCode: "0411001" }, "leading zero");
  rejects(participantSchema, { ...collegeParticipant, pinCode: "4110" }, "too short");
});

test("a future date of birth is rejected", () => {
  rejects(participantSchema, { ...collegeParticipant, dateOfBirth: "2099-01-01" }, "future dob");
});

test("impossible calendar dates are rejected", () => {
  rejects(participantSchema, { ...collegeParticipant, dateOfBirth: "2004-02-31" }, "overflow date");
  rejects(leaderSchema, { ...leader, vargDate: "2026-04-31" }, "impossible event date");
});

test("declaration must be accepted", () => {
  rejects(participantSchema, { ...collegeParticipant, declarationAccepted: false }, "declined");
  rejects(participantSchema, { ...schoolParticipant, declarationAccepted: false }, "school declined");
});

test("OTHER language without a value is rejected", () => {
  rejects(participantSchema, {
    ...collegeParticipant, languagesKnown: ["OTHER"], otherLanguage: "",
  }, "other without value");
});

test("participant counts above the limit are rejected", () => {
  rejects(leaderSchema, { ...leader, participantCount: "100001" }, "too many participants");
  rejects(leaderSchema, { ...leader, vargCount: "10001" }, "too many vargs");
  ok(leaderSchema, { ...leader, participantCount: "100000" }, "at the participant limit");
});

test("non-numeric counts are rejected", () => {
  rejects(leaderSchema, { ...leader, participantCount: "many" }, "words not numbers");
});

test("arbitrary JSON is rejected — the hole this closes", () => {
  rejects(participantSchema, { hello: "world" }, "junk participant");
  rejects(organizerSchema, { hello: "world" }, "junk organizer");
  rejects(leaderSchema, { hello: "world" }, "junk leader");
  rejects(participantSchema, {}, "empty object");
});

test("an unknown course value is rejected", () => {
  rejects(participantSchema, { ...collegeParticipant, course: "MBBS" }, "unlisted course");
});

test("an unknown gender is rejected", () => {
  rejects(participantSchema, { ...collegeParticipant, gender: "X" }, "unlisted gender");
});

test("participant dropdown values and field length limits are enforced", () => {
  rejects(participantSchema, { ...schoolParticipant, standard: "13" }, "invalid school standard");
  rejects(participantSchema, { ...collegeParticipant, bloodGroup: "unknown" }, "invalid blood group");
  rejects(participantSchema, { ...collegeParticipant, semester: 5 }, "invalid semester");
  rejects(participantSchema, { ...collegeParticipant, address: "a".repeat(501) }, "long address");
});

test("numeric varg identifiers and phone digits are validated", () => {
  rejects(participantSchema, { ...collegeParticipant, amrutVargId: "not-an-id" }, "non-numeric varg ID");
  rejects(leaderSchema, { ...leader, institutionPhone: "++++++++" }, "punctuation-only phone");
});

test("unknown public submission fields are stripped from parsed data", () => {
  const parsed = participantSchema.parse({ ...collegeParticipant, admin: true, deleted_at: "now" });
  assert.equal("admin" in parsed, false);
  assert.equal("deleted_at" in parsed, false);
});

// ── Organizer: the institution-shaped record ────────────────────────────────
//
// The form asks for three names because they are three different things: the
// organisation, whoever runs the varg, and whoever answers the phone. Only the
// branch is optional — a single school or housing society has none to give.

test("every organizer field except the branch is required", () => {
  for (const key of ["organisation", "name", "contactPerson", "designation", "district"]) {
    const without = { ...organizer, [key]: "" };
    const r = organizerSchema.safeParse(without);
    assert.equal(r.success, false, `${key} should be required`);
    assert.ok(
      r.error.issues.some((i) => i.path[0] === key),
      `the error should name ${key}`
    );
    // Whitespace is not a value.
    assert.equal(organizerSchema.safeParse({ ...organizer, [key]: "   " }).success, false, key);
  }
});

test("the branch is optional and may be omitted entirely", () => {
  assert.equal(organizerSchema.safeParse({ ...organizer, branch: "" }).success, true);
  const without = { ...organizer };
  delete without.branch;
  assert.equal(organizerSchema.safeParse(without).success, true);
});

test("the organiser and the contact person are separate fields", () => {
  const r = organizerSchema.safeParse(organizer);
  assert.equal(r.success, true);
  assert.equal(r.data.name, "संजय कुलकर्णी");
  assert.equal(r.data.contactPerson, "मीना देशपांडे");
  assert.notEqual(r.data.name, r.data.contactPerson);
});

test("the retired `place` field is neither required nor stored", () => {
  // Submissions made before the form changed keep their stored `place`; the
  // schema simply no longer asks for one, and ignores it if sent.
  const r = organizerSchema.safeParse({ ...organizer, place: "पुणे" });
  assert.equal(r.success, true);
  assert.ok(!("place" in r.data), "an unexpected key should be stripped, not kept");
});

test("the organizer mobile is held to the same rule as every other form", () => {
  assert.equal(organizerSchema.safeParse({ ...organizer, mobile: "12345" }).success, false);
  assert.equal(organizerSchema.safeParse({ ...organizer, mobile: "1234567890" }).success, false);
  assert.equal(organizerSchema.safeParse({ ...organizer, mobile: "9123456789" }).success, true);
});
