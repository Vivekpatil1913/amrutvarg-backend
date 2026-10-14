// Validation rules for the Yashogatha section wording.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseYashogatha } from "./yashogatha.schema.js";
import { DEFAULT_YASHOGATHA } from "./yashogatha.defaults.js";
import { TARGET_VALUES } from "../hero/hero.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_YASHOGATHA));

test("the shipped default configuration is valid", () => {
  const r = parseYashogatha(DEFAULT_YASHOGATHA);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("a Marathi heading is required", () => {
  const c = clone();
  c.text.title_mr = "";
  assert.equal(parseYashogatha(c).success, false);
});

test("whitespace-only values are rejected where a value is required", () => {
  const c = clone();
  c.labels.read_more_mr = "   ";
  assert.equal(parseYashogatha(c).success, false);
});

test("the read-more and view-all labels are required", () => {
  const a = clone(); a.labels.read_more_mr = "";
  assert.equal(parseYashogatha(a).success, false);
  const b = clone(); b.labels.view_all_mr = "";
  assert.equal(parseYashogatha(b).success, false);
});

test("English fields may be left blank", () => {
  const c = clone();
  c.text.title_en = "";
  c.labels.read_more_en = "";
  c.detail_note.text_en = "";
  assert.equal(parseYashogatha(c).success, true);
});

test("the disclaimer may be emptied and switched off", () => {
  const c = clone();
  c.detail_note.text_mr = "";
  c.detail_note.enabled = false;
  assert.equal(parseYashogatha(c).success, true);
});

test("featured_count must be a whole number of at least one", () => {
  const zero = clone(); zero.homepage.featured_count = 0;
  assert.equal(parseYashogatha(zero).success, false);
  const neg = clone(); neg.homepage.featured_count = -2;
  assert.equal(parseYashogatha(neg).success, false);
  const frac = clone(); frac.homepage.featured_count = 2.5;
  assert.equal(parseYashogatha(frac).success, false);
});

test("featured_count above twelve is rejected", () => {
  const c = clone();
  c.homepage.featured_count = 13;
  assert.equal(parseYashogatha(c).success, false);
});

test("a numeric string featured_count is coerced", () => {
  const c = clone();
  c.homepage.featured_count = "4";
  const r = parseYashogatha(c);
  assert.equal(r.success, true);
  assert.equal(r.data.homepage.featured_count, 4);
});

test("a destination outside the allowlist is rejected", () => {
  const c = clone();
  c.homepage.view_all_target = "https://evil.example.com";
  assert.equal(parseYashogatha(c).success, false);
});

test("every allowlisted destination is accepted", () => {
  for (const target of TARGET_VALUES) {
    const c = clone();
    c.homepage.view_all_target = target;
    assert.equal(parseYashogatha(c).success, true, `rejected ${target}`);
  }
});

test("over-long text is rejected rather than silently truncated", () => {
  const c = clone();
  c.detail_note.text_mr = "अ".repeat(401);
  assert.equal(parseYashogatha(c).success, false);

  const lead = clone();
  lead.text.lead_mr = "अ".repeat(301);
  assert.equal(parseYashogatha(lead).success, false);
});

test("text is trimmed on the way in", () => {
  const c = clone();
  c.text.title_mr = "  यशोगाथा  ";
  const r = parseYashogatha(c);
  assert.equal(r.success, true);
  assert.equal(r.data.text.title_mr, "यशोगाथा");
});

test("arbitrary JSON is rejected", () => {
  assert.equal(parseYashogatha({ hello: "world" }).success, false);
  assert.equal(parseYashogatha({}).success, false);
});
