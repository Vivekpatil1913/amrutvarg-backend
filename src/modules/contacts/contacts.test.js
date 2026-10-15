// Field validation for a district contact.
// Run with: npm test
//
// The relationship checks (division, districts, role) need the database and are
// covered by the route; this file pins the field rules, which are what the
// editor mirrors.

import test from "node:test";
import assert from "node:assert/strict";
import { contactSchema, normalisePhone } from "./contacts.schema.js";

const VALID = {
  division_mr: "पुणे",
  division_en: "Pune",
  role: "districtManager",
  districts: ["पुणे", "सातारा"],
  name: "संजय पाटील",
  email: "pune.div@amrutvarg.org",
  phone: "9876543210",
  is_active: true,
  display_order: 0,
};

const clone = (over = {}) => ({ ...JSON.parse(JSON.stringify(VALID)), ...over });
const parse = (over) => contactSchema.safeParse(clone(over));
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("a complete contact is valid", () => {
  const r = contactSchema.safeParse(VALID);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

// ── required fields ─────────────────────────────────────────────────────────

test("a name is required", () => {
  const r = parse({ name: "" });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("name"));
});

test("a whitespace-only name is rejected", () => {
  assert.equal(parse({ name: "   " }).success, false);
});

test("a Marathi division is required", () => {
  const r = parse({ division_mr: "" });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("division_mr"));
});

test("a role is required", () => {
  const r = parse({ role: "" });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("role"));
});

test("a role with spaces or punctuation is rejected", () => {
  assert.equal(parse({ role: "district manager" }).success, false);
});

test("the English division may be left blank", () => {
  assert.equal(parse({ division_en: "" }).success, true);
});

// ── email ───────────────────────────────────────────────────────────────────

test("an empty email is allowed", () => {
  assert.equal(parse({ email: "" }).success, true);
});

test("a malformed email is rejected", () => {
  for (const bad of ["not-an-email", "a@", "@b.com", "a b@c.com", "a@b"]) {
    const r = parse({ email: bad });
    assert.equal(r.success, false, `${bad} should be rejected`);
    assert.ok(fieldsOf(r).includes("email"));
  }
});

test("a valid email is accepted and trimmed", () => {
  const r = parse({ email: "  person@example.org  " });
  assert.equal(r.success, true);
  assert.equal(r.data.email, "person@example.org");
});

// ── phone ───────────────────────────────────────────────────────────────────

test("an empty phone is allowed", () => {
  assert.equal(parse({ phone: "" }).success, true);
});

test("a ten-digit phone is kept as typed", () => {
  const r = parse({ phone: "9876543210" });
  assert.equal(r.success, true);
  assert.equal(r.data.phone, "9876543210");
});

test("spaces, dashes and brackets are stripped", () => {
  const r = parse({ phone: "98765 43210" });
  assert.equal(r.success, true);
  assert.equal(r.data.phone, "9876543210");
});

test("a +91 country code is removed", () => {
  const r = parse({ phone: "+91 98765 43210" });
  assert.equal(r.success, true);
  assert.equal(r.data.phone, "9876543210");
});

// The number that made a naive prefix-strip wrong: it is ten digits and starts
// with 91, so removing the leading 91 would corrupt a valid number.
test("a ten-digit number starting with 91 is not mistaken for a country code", () => {
  const r = parse({ phone: "9112227668" });
  assert.equal(r.success, true);
  assert.equal(r.data.phone, "9112227668");
});

test("too few digits is rejected", () => {
  const r = parse({ phone: "98765" });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("phone"));
});

test("too many digits is rejected", () => {
  assert.equal(parse({ phone: "98765432101" }).success, false);
});

test("letters in a phone are rejected", () => {
  assert.equal(parse({ phone: "98765abcde" }).success, false);
});

test("normalisePhone leaves a short string alone for the message to explain", () => {
  assert.equal(normalisePhone("12-34"), "1234");
});

// ── districts ───────────────────────────────────────────────────────────────

test("an empty district list is allowed", () => {
  const r = parse({ districts: [] });
  assert.equal(r.success, true);
  assert.deepEqual(r.data.districts, []);
});

test("blank district entries are dropped rather than rejected", () => {
  const r = parse({ districts: ["पुणे", "", "   ", "सातारा"] });
  assert.equal(r.success, true);
  assert.deepEqual(r.data.districts, ["पुणे", "सातारा"]);
});

test("duplicate districts are collapsed", () => {
  const r = parse({ districts: ["पुणे", "पुणे", "सातारा"] });
  assert.equal(r.success, true);
  assert.deepEqual(r.data.districts, ["पुणे", "सातारा"]);
});

test("more than forty districts is rejected", () => {
  const many = Array.from({ length: 41 }, (_, i) => `जिल्हा${i}`);
  assert.equal(parse({ districts: many }).success, false);
});

// ── display order and flags ─────────────────────────────────────────────────

test("a negative display order is rejected", () => {
  const r = parse({ display_order: -1 });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("display_order"));
});

test("a fractional display order is rejected", () => {
  assert.equal(parse({ display_order: 1.5 }).success, false);
});

test("a numeric string display order is coerced", () => {
  const r = parse({ display_order: "7" });
  assert.equal(r.success, true);
  assert.equal(r.data.display_order, 7);
});

test("display order defaults to zero when omitted", () => {
  const { display_order: _omit, ...rest } = clone();
  const r = contactSchema.safeParse(rest);
  assert.equal(r.success, true);
  assert.equal(r.data.display_order, 0);
});

test("is_active defaults to true when omitted", () => {
  const { is_active: _omit, ...rest } = clone();
  const r = contactSchema.safeParse(rest);
  assert.equal(r.success, true);
  assert.equal(r.data.is_active, true);
});

test("text is trimmed on the way in", () => {
  const r = parse({ name: "  संजय पाटील  ", division_mr: "  पुणे  " });
  assert.equal(r.success, true);
  assert.equal(r.data.name, "संजय पाटील");
  assert.equal(r.data.division_mr, "पुणे");
});

test("a name past the column limit is rejected", () => {
  assert.equal(parse({ name: "अ".repeat(201) }).success, false);
});

test("arbitrary JSON is rejected", () => {
  assert.equal(contactSchema.safeParse({ hello: "world" }).success, false);
});

test("every field error is reported at once, not one at a time", () => {
  const r = contactSchema.safeParse({
    division_mr: "", role: "", name: "", email: "nope", phone: "12",
  });
  assert.equal(r.success, false);
  const fields = fieldsOf(r);
  for (const f of ["division_mr", "role", "name", "email", "phone"]) {
    assert.ok(fields.includes(f), `expected an issue on ${f}`);
  }
});
