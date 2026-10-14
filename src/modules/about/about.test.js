// Validation rules for the About section.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseAbout } from "./about.schema.js";
import { DEFAULT_ABOUT } from "./about.defaults.js";
import { ICONS } from "../hero/hero.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_ABOUT));

test("the shipped default configuration is valid", () => {
  const r = parseAbout(DEFAULT_ABOUT);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("a Marathi heading is required", () => {
  const c = clone();
  c.text.title_mr = "";
  const r = parseAbout(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "text.title_mr"));
});

test("a whitespace-only heading is rejected", () => {
  const c = clone();
  c.text.title_mr = "    ";
  assert.equal(parseAbout(c).success, false);
});

test("English fields may be left blank", () => {
  const c = clone();
  c.text.title_en = "";
  c.text.badge_en = "";
  assert.equal(parseAbout(c).success, true);
});

test("every step needs a Marathi question and title", () => {
  const noQ = clone();
  noQ.steps[0].question_mr = "";
  assert.equal(parseAbout(noQ).success, false);

  const noT = clone();
  noT.steps[1].title_mr = "";
  assert.equal(parseAbout(noT).success, false);
});

test("an icon the frontend cannot render is rejected", () => {
  const c = clone();
  c.steps[0].icon = "not-a-real-icon";
  assert.equal(parseAbout(c).success, false);
});

test("every allowlisted icon is accepted", () => {
  for (const icon of ICONS) {
    const c = clone();
    c.steps[0].icon = icon;
    assert.equal(parseAbout(c).success, true, `rejected ${icon}`);
  }
});

test("at least one step is required", () => {
  const c = clone();
  c.steps = [];
  assert.equal(parseAbout(c).success, false);
});

test("more than eight steps is rejected", () => {
  const c = clone();
  c.steps = Array.from({ length: 9 }, (_, i) => ({
    ...DEFAULT_ABOUT.steps[0], id: `step-${i}`,
  }));
  assert.equal(parseAbout(c).success, false);
});

test("duplicate step ids are rejected", () => {
  const c = clone();
  c.steps[1].id = c.steps[0].id;
  const r = parseAbout(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.message.startsWith("Duplicate id")));
});

test("duplicate feature ids are rejected", () => {
  const c = clone();
  c.features.items[1].id = c.features.items[0].id;
  assert.equal(parseAbout(c).success, false);
});

test("a feature needs a Marathi label", () => {
  const c = clone();
  c.features.items[0].label_mr = "";
  assert.equal(parseAbout(c).success, false);
});

test("more than twelve features is rejected", () => {
  const c = clone();
  c.features.items = Array.from({ length: 13 }, (_, i) => ({
    id: `f-${i}`, label_mr: "क", label_en: "", enabled: true,
  }));
  assert.equal(parseAbout(c).success, false);
});

test("over-long text is rejected rather than silently truncated", () => {
  const c = clone();
  c.steps[0].desc_mr = "अ".repeat(601);
  assert.equal(parseAbout(c).success, false);

  const t = clone();
  t.text.title_mr = "अ".repeat(121);
  assert.equal(parseAbout(t).success, false);
});

test("a media reference must be a positive integer or null", () => {
  const bad = clone();
  bad.image.media_id = -3;
  assert.equal(parseAbout(bad).success, false);

  const ok = clone();
  ok.image.media_id = null;
  assert.equal(parseAbout(ok).success, true);
});

test("disabled entries survive validation so they can be re-enabled", () => {
  const c = clone();
  c.steps[0].enabled = false;
  c.features.items[2].enabled = false;
  const r = parseAbout(c);
  assert.equal(r.success, true);
  assert.equal(r.data.steps[0].enabled, false);
  assert.equal(r.data.features.items[2].enabled, false);
});

test("text is trimmed on the way in", () => {
  const c = clone();
  c.text.title_mr = "  अमृत वर्ग म्हणजे काय?  ";
  const r = parseAbout(c);
  assert.equal(r.success, true);
  assert.equal(r.data.text.title_mr, "अमृत वर्ग म्हणजे काय?");
});

test("arbitrary JSON is rejected", () => {
  assert.equal(parseAbout({ hello: "world" }).success, false);
  assert.equal(parseAbout({}).success, false);
});
