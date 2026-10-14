// Validation rules for the Session section.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseSession } from "./session.schema.js";
import { DEFAULT_SESSION } from "./session.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_SESSION));

test("the shipped default configuration is valid", () => {
  const r = parseSession(DEFAULT_SESSION);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("the seeded plan adds up to one hour", () => {
  const total = DEFAULT_SESSION.steps.reduce((n, s) => n + s.min, 0);
  assert.equal(total, 60);
});

test("a Marathi heading is required", () => {
  const c = clone();
  c.text.title_mr = "";
  assert.equal(parseSession(c).success, false);
});

test("a whitespace-only heading is rejected", () => {
  const c = clone();
  c.text.title_mr = "   ";
  assert.equal(parseSession(c).success, false);
});

test("English fields may be left blank", () => {
  const c = clone();
  c.text.title_en = "";
  c.text.lead_en = "";
  c.steps[0].title_en = "";
  assert.equal(parseSession(c).success, true);
});

test("every step needs a Marathi title", () => {
  const c = clone();
  c.steps[2].title_mr = "";
  const r = parseSession(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "steps.2.title_mr"));
});

test("a step description may be empty", () => {
  const c = clone();
  assert.equal(c.steps[3].desc_mr, "");
  assert.equal(parseSession(c).success, true);
});

test("zero minutes is allowed — it marks a step with no clock", () => {
  const c = clone();
  c.steps[0].min = 0;
  const r = parseSession(c);
  assert.equal(r.success, true);
  assert.equal(r.data.steps[0].min, 0);
});

test("negative minutes are rejected", () => {
  const c = clone();
  c.steps[1].min = -5;
  assert.equal(parseSession(c).success, false);
});

test("fractional minutes are rejected", () => {
  const c = clone();
  c.steps[1].min = 7.5;
  assert.equal(parseSession(c).success, false);
});

test("a step longer than two hours is rejected", () => {
  const c = clone();
  c.steps[1].min = 121;
  assert.equal(parseSession(c).success, false);
});

test("minutes arriving as a numeric string are coerced", () => {
  const c = clone();
  c.steps[1].min = "15";
  const r = parseSession(c);
  assert.equal(r.success, true);
  assert.equal(r.data.steps[1].min, 15);
});

test("non-numeric minutes are rejected", () => {
  const c = clone();
  c.steps[1].min = "soon";
  assert.equal(parseSession(c).success, false);
});

test("at least one step is required", () => {
  const c = clone();
  c.steps = [];
  assert.equal(parseSession(c).success, false);
});

test("more than fifteen steps is rejected", () => {
  const c = clone();
  c.steps = Array.from({ length: 16 }, (_, i) => ({ ...DEFAULT_SESSION.steps[0], id: `ses-${i}` }));
  assert.equal(parseSession(c).success, false);
});

test("duplicate step ids are rejected", () => {
  const c = clone();
  c.steps[1].id = c.steps[0].id;
  const r = parseSession(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.message.startsWith("Duplicate id")));
});

test("over-long text is rejected rather than silently truncated", () => {
  const c = clone();
  c.steps[0].desc_mr = "अ".repeat(401);
  assert.equal(parseSession(c).success, false);

  const h = clone();
  h.text.title_mr = "अ".repeat(161);
  assert.equal(parseSession(h).success, false);
});

test("disabled steps survive validation so they can be re-enabled", () => {
  const c = clone();
  c.steps[3].enabled = false;
  const r = parseSession(c);
  assert.equal(r.success, true);
  assert.equal(r.data.steps[3].enabled, false);
});

test("text is trimmed on the way in", () => {
  const c = clone();
  c.steps[0].title_mr = "  प्रार्थना  ";
  const r = parseSession(c);
  assert.equal(r.success, true);
  assert.equal(r.data.steps[0].title_mr, "प्रार्थना");
});

test("arbitrary JSON is rejected", () => {
  assert.equal(parseSession({ hello: "world" }).success, false);
  assert.equal(parseSession({}).success, false);
});
