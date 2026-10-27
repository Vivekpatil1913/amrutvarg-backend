// Field rules, status transitions and the SLA clock for grievance tickets.
// Run with: npm test
//
// The routes add database checks (district belongs to division, jurisdiction);
// this file pins the rules that need no database.

import test from "node:test";
import assert from "node:assert/strict";
import { grievanceSchema, checkTransition, ticketNumber, EMAIL_RFC5322 } from "./grievances.schema.js";
import { slaState } from "./grievances.sla.js";

const VALID = {
  submission_type: "COMPLAINT",
  division_id: "2",
  district_id: "8",
  full_name: "राम पाटील",
  email: "ram.patil@example.com",
  mobile_number: "9876543210",
  subject: "Varg timing issue",
  description: "The varg starts late every day and children wait outside.",
};

const parse = (over = {}) => grievanceSchema.safeParse({ ...VALID, ...over });
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("a complete submission is valid and ids are coerced from form strings", () => {
  const r = parse();
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
  assert.equal(r.data.division_id, 2);
});

test("submission type must be Suggestion or Complaint", () => {
  assert.deepEqual(fieldsOf(parse({ submission_type: "PRAISE" })), ["submission_type"]);
  assert.equal(parse({ submission_type: "SUGGESTION" }).success, true);
});

test("division and district are mandatory", () => {
  assert.deepEqual(fieldsOf(parse({ division_id: "", district_id: "" })).sort(), ["district_id", "division_id"]);
});

test("full name: at least 3 letters, letters only, any script", () => {
  assert.equal(parse({ full_name: "Ram Patil" }).success, true);
  assert.equal(parse({ full_name: "R. K. Patil" }).success, true);
  assert.equal(parse({ full_name: "सौ. सुनीता जोशी" }).success, true);
  assert.ok(fieldsOf(parse({ full_name: "Ra" })).includes("full_name"));
  assert.ok(fieldsOf(parse({ full_name: "Ram 2" })).includes("full_name"));
  assert.ok(fieldsOf(parse({ full_name: "Ram@Patil" })).includes("full_name"));
});

test("email follows RFC 5322", () => {
  for (const ok of ["a@b.co", "first.last+tag@sub.example.org", '"quoted"@example.com']) {
    assert.equal(EMAIL_RFC5322.test(ok), true, ok);
  }
  for (const bad of ["plain", "a@", "@b.co", "a b@c.co", "a@b..co", "a@-b.co"]) {
    assert.equal(EMAIL_RFC5322.test(bad), false, bad);
  }
});

test("mobile is 10 digits starting 6-9", () => {
  assert.equal(parse({ mobile_number: "6000000000" }).success, true);
  for (const bad of ["5123456789", "987654321", "98765432101", "+919876543210"]) {
    assert.ok(fieldsOf(parse({ mobile_number: bad })).includes("mobile_number"), bad);
  }
});

test("subject 5-120 and description 20-2000 characters, measured after trimming", () => {
  assert.ok(fieldsOf(parse({ subject: "  abc  " })).includes("subject"));
  assert.ok(fieldsOf(parse({ subject: "x".repeat(121) })).includes("subject"));
  assert.ok(fieldsOf(parse({ description: "too short" })).includes("description"));
  assert.ok(fieldsOf(parse({ description: "x".repeat(2001) })).includes("description"));
  assert.equal(parse({ subject: "x".repeat(120), description: "x".repeat(2000) }).success, true);
});

test("resolving needs Action Taken Notes in the request", () => {
  const ticket = { status: "IN_PROGRESS", action_taken_notes: "" };
  assert.equal(checkTransition(ticket, { status: "RESOLVED", action_taken_notes: "" })[0].field, "action_taken_notes");
  assert.equal(checkTransition(ticket, { status: "RESOLVED", action_taken_notes: "short" })[0].field, "action_taken_notes");
  assert.deepEqual(checkTransition(ticket, { status: "RESOLVED", action_taken_notes: "Coordinator spoken to; fixed." }), []);
});

test("closing a resolved ticket may rely on its recorded notes", () => {
  const ticket = { status: "RESOLVED", action_taken_notes: "Coordinator spoken to; fixed." };
  assert.deepEqual(checkTransition(ticket, { status: "CLOSED", action_taken_notes: "" }), []);
});

test("illegal transitions are refused", () => {
  assert.equal(checkTransition({ status: "NEW" }, { status: "CLOSED", action_taken_notes: "x".repeat(20) })[0].field, "status");
  assert.equal(checkTransition({ status: "CLOSED" }, { status: "IN_PROGRESS" })[0].field, "status");
  assert.equal(checkTransition({ status: "NEW" }, { status: "NEW" })[0].field, "status");
});

test("ticket numbers are stable and zero-padded", () => {
  assert.equal(ticketNumber(42, "2026-10-27T10:00:00Z"), "AV-2026-000042");
});

test("SLA clock: OK, amber when unacknowledged past 24h or close to 72h, red past 72h", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  const at = (hours, status = "NEW") => ({ status, created_at: new Date(now - hours * 3600e3).toISOString() });
  assert.equal(slaState(at(2), {}, now), "OK");
  assert.equal(slaState(at(30), {}, now), "AMBER");
  assert.equal(slaState(at(30, "ACKNOWLEDGED"), {}, now), "OK");
  assert.equal(slaState(at(50, "IN_PROGRESS"), {}, now), "AMBER");
  assert.equal(slaState(at(73, "IN_PROGRESS"), {}, now), "RED");
  assert.equal(slaState(at(100, "RESOLVED"), {}, now), "MET");
});
