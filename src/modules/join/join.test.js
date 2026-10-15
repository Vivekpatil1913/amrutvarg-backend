// Validation rules for the Join section.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseJoin } from "./join.schema.js";
import { DEFAULT_JOIN, ACTION_VALUES } from "./join.defaults.js";
import { ICONS } from "../hero/hero.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_JOIN));

test("the shipped default configuration is valid", () => {
  const r = parseJoin(DEFAULT_JOIN);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("the seeded section ships the three registration routes", () => {
  assert.deepEqual(DEFAULT_JOIN.cards.map((c) => c.action), ["varg", "organizer", "leader"]);
});

test("a Marathi heading is required", () => {
  const c = clone();
  c.text.title_mr = "";
  assert.equal(parseJoin(c).success, false);
});

test("a whitespace-only heading is rejected", () => {
  const c = clone();
  c.text.title_mr = "   ";
  assert.equal(parseJoin(c).success, false);
});

test("English fields may be left blank", () => {
  const c = clone();
  c.text.title_en = "";
  c.text.lead_en = "";
  c.cards[0].title_en = "";
  c.cards[0].action_en = "";
  assert.equal(parseJoin(c).success, true);
});

test("every card needs a Marathi title", () => {
  const c = clone();
  c.cards[1].title_mr = "";
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "cards.1.title_mr"));
});

test("every card needs a Marathi button label", () => {
  const c = clone();
  c.cards[0].action_mr = "";
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "cards.0.action_mr"));
});

test("a card description may be empty", () => {
  const c = clone();
  c.cards[0].desc_mr = "";
  assert.equal(parseJoin(c).success, true);
});

test("a card may carry no required-detail chips", () => {
  const c = clone();
  assert.deepEqual(c.cards[2].needs, []);
  assert.equal(parseJoin(c).success, true);
});

test("every allowlisted icon is accepted", () => {
  for (const icon of ICONS) {
    const c = clone();
    c.cards[0].icon = icon;
    c.cards[0].action_icon = icon;
    assert.equal(parseJoin(c).success, true, `icon ${icon} was rejected`);
  }
});

test("an icon outside the allowlist is rejected", () => {
  const c = clone();
  c.cards[0].icon = "rocket";
  assert.equal(parseJoin(c).success, false);
});

test("every allowlisted action is accepted", () => {
  for (const action of ACTION_VALUES) {
    const c = clone();
    c.cards[0].action = action;
    assert.equal(parseJoin(c).success, true, `action ${action} was rejected`);
  }
});

test("an action no handler is wired to is rejected", () => {
  const c = clone();
  c.cards[0].action = "donate";
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "cards.0.action"));
});

test("duplicate card ids are rejected", () => {
  const c = clone();
  c.cards[1].id = c.cards[0].id;
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => /Duplicate id/.test(i.message)));
});

test("duplicate chip ids within one card are rejected", () => {
  const c = clone();
  c.cards[0].needs[1].id = c.cards[0].needs[0].id;
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => /Duplicate id/.test(i.message)));
});

test("a chip needs a Marathi label", () => {
  const c = clone();
  c.cards[0].needs[0].label_mr = "";
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "cards.0.needs.0.label_mr"));
});

test("more than eight chips is rejected", () => {
  const c = clone();
  c.cards[0].needs = Array.from({ length: 9 }, (_, i) => ({
    id: `chip-${i}`, label_mr: `चिप ${i}`, label_en: `Chip ${i}`,
  }));
  assert.equal(parseJoin(c).success, false);
});

test("the section cannot be emptied of cards", () => {
  const c = clone();
  c.cards = [];
  assert.equal(parseJoin(c).success, false);
});

test("a link address without a label is rejected", () => {
  const c = clone();
  c.cards[2].link_label_mr = "";
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "cards.2.link_label_mr"));
});

test("a link label without an address is rejected", () => {
  const c = clone();
  c.cards[2].link_url = "";
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "cards.2.link_url"));
});

test("a card with neither link part is fine", () => {
  const c = clone();
  c.cards[2].link_url = "";
  c.cards[2].link_label_mr = "";
  c.cards[2].link_label_en = "";
  assert.equal(parseJoin(c).success, true);
});

test("a non-http link is rejected", () => {
  const c = clone();
  c.cards[2].link_url = "javascript:alert(1)";
  const r = parseJoin(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "cards.2.link_url"));
});

test("a relative link is rejected", () => {
  const c = clone();
  c.cards[2].link_url = "/portal";
  assert.equal(parseJoin(c).success, false);
});

test("a disabled card still validates — hiding is not deleting", () => {
  const c = clone();
  c.cards[1].enabled = false;
  assert.equal(parseJoin(c).success, true);
});

test("text past the card layout's limit is rejected", () => {
  const c = clone();
  c.cards[0].desc_mr = "अ".repeat(601);
  assert.equal(parseJoin(c).success, false);
});
