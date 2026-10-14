// Validation rules for the Activities section.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseActivities } from "./activities.schema.js";
import { DEFAULT_ACTIVITIES } from "./activities.defaults.js";
import { ICONS, TARGET_VALUES } from "../hero/hero.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_ACTIVITIES));

test("the shipped default configuration is valid", () => {
  const r = parseActivities(DEFAULT_ACTIVITIES);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("a Marathi heading is required", () => {
  const c = clone();
  c.text.title_mr = "";
  assert.equal(parseActivities(c).success, false);
});

test("a whitespace-only heading is rejected", () => {
  const c = clone();
  c.text.title_mr = "   ";
  assert.equal(parseActivities(c).success, false);
});

test("English fields may be left blank", () => {
  const c = clone();
  c.text.title_en = "";
  c.text.lead_en = "";
  c.items[0].title_en = "";
  assert.equal(parseActivities(c).success, true);
});

test("every card needs a Marathi title", () => {
  const c = clone();
  c.items[2].title_mr = "";
  const r = parseActivities(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "items.2.title_mr"));
});

test("an icon the frontend cannot render is rejected", () => {
  const c = clone();
  c.items[0].icon = "not-a-real-icon";
  assert.equal(parseActivities(c).success, false);
});

test("every allowlisted icon is accepted", () => {
  for (const icon of ICONS) {
    const c = clone();
    c.items[0].icon = icon;
    assert.equal(parseActivities(c).success, true, `rejected ${icon}`);
  }
});

test("a destination outside the allowlist is rejected", () => {
  const c = clone();
  c.cta.target = "https://evil.example.com";
  assert.equal(parseActivities(c).success, false);
});

test("every allowlisted destination is accepted", () => {
  for (const target of TARGET_VALUES) {
    const c = clone();
    c.cta.target = target;
    assert.equal(parseActivities(c).success, true, `rejected ${target}`);
  }
});

test("at least one activity is required", () => {
  const c = clone();
  c.items = [];
  assert.equal(parseActivities(c).success, false);
});

test("more than twelve activities is rejected", () => {
  const c = clone();
  c.items = Array.from({ length: 13 }, (_, i) => ({ ...DEFAULT_ACTIVITIES.items[0], id: `act-${i}` }));
  assert.equal(parseActivities(c).success, false);
});

test("duplicate card ids are rejected", () => {
  const c = clone();
  c.items[1].id = c.items[0].id;
  const r = parseActivities(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.message.startsWith("Duplicate id")));
});

test("more than eight outcomes on a card is rejected", () => {
  const c = clone();
  c.items[0].gains_mr = Array.from({ length: 9 }, (_, i) => `ग${i}`);
  assert.equal(parseActivities(c).success, false);
});

test("blank outcomes are dropped, not rejected", () => {
  const c = clone();
  c.items[0].gains_mr = ["निरोगी शरीर", "", "   ", "सक्रियता"];
  const r = parseActivities(c);
  assert.equal(r.success, true);
  assert.deepEqual(r.data.items[0].gains_mr, ["निरोगी शरीर", "सक्रियता"]);
});

test("a card may have no outcomes at all", () => {
  const c = clone();
  c.items[0].gains_mr = [];
  c.items[0].gains_en = [];
  assert.equal(parseActivities(c).success, true);
});

test("over-long text is rejected rather than silently truncated", () => {
  const c = clone();
  c.items[0].title_mr = "अ".repeat(161);
  assert.equal(parseActivities(c).success, false);

  const lead = clone();
  lead.text.lead_mr = "अ".repeat(301);
  assert.equal(parseActivities(lead).success, false);
});

test("disabled cards survive validation so they can be re-enabled", () => {
  const c = clone();
  c.items[3].enabled = false;
  const r = parseActivities(c);
  assert.equal(r.success, true);
  assert.equal(r.data.items[3].enabled, false);
});

test("text is trimmed on the way in", () => {
  const c = clone();
  c.text.title_mr = "  प्रमुख उपक्रम  ";
  const r = parseActivities(c);
  assert.equal(r.success, true);
  assert.equal(r.data.text.title_mr, "प्रमुख उपक्रम");
});

test("arbitrary JSON is rejected", () => {
  assert.equal(parseActivities({ hello: "world" }).success, false);
  assert.equal(parseActivities({}).success, false);
});
