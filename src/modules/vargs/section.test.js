// Validation rules for the Amrut Varg section wording.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseVargsSection } from "./section.schema.js";
import {
  DEFAULT_VARGS_SECTION,
  STAT_SOURCE_VALUES,
  STAT_ICONS,
  ORDER_SOURCE_VALUES,
} from "./section.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_VARGS_SECTION));
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("the shipped default configuration is valid", () => {
  const r = parseVargsSection(DEFAULT_VARGS_SECTION);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("a Marathi heading is required", () => {
  const c = clone();
  c.text.title_mr = "";
  assert.equal(parseVargsSection(c).success, false);
});

test("whitespace-only values are rejected where a value is required", () => {
  const c = clone();
  c.card.cta_mr = "   ";
  assert.equal(parseVargsSection(c).success, false);
});

test("English fields may be left blank", () => {
  const c = clone();
  c.text.title_en = "";
  c.text.lead_en = "";
  c.atlas.title_en = "";
  c.search.placeholder_en = "";
  c.card.cta_en = "";
  assert.equal(parseVargsSection(c).success, true);
});

// ── Placeholders ────────────────────────────────────────────────────────────

test("an unknown placeholder is rejected rather than printed to the page", () => {
  const c = clone();
  c.text.lead_mr = "सध्या {total} वर्ग उपलब्ध आहेत.";
  const r = parseVargsSection(c);
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("text.lead_mr"));
});

test("a count phrase must keep its {count}", () => {
  const c = clone();
  c.search.results_count_mr = "अमृत वर्ग आढळले";
  const r = parseVargsSection(c);
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("search.results_count_mr"));
});

test("a name phrase must keep its {name}", () => {
  const c = clone();
  c.card.division_suffix_mr = "विभाग";
  const r = parseVargsSection(c);
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("card.division_suffix_mr"));
});

test("the lead may drop {count} — the sentence can be written without a number", () => {
  const c = clone();
  c.text.lead_mr = "सहभागी होण्यासाठी आपल्या जवळचा वर्ग शोधा.";
  assert.equal(parseVargsSection(c).success, true);
});

test("{count} in the wrong field is still an unknown placeholder", () => {
  const c = clone();
  c.card.division_suffix_mr = "{count} विभाग";
  assert.equal(parseVargsSection(c).success, false);
});

// ── Statistics ──────────────────────────────────────────────────────────────

test("every statistic source the defaults use is one the schema allows", () => {
  for (const item of DEFAULT_VARGS_SECTION.stats.items) {
    assert.ok(STAT_SOURCE_VALUES.includes(item.source), item.source);
    assert.ok(STAT_ICONS.includes(item.icon), item.icon);
  }
});

test("an unknown statistic source is rejected", () => {
  const c = clone();
  c.stats.items[0].source = "made_up_count";
  assert.equal(parseVargsSection(c).success, false);
});

test("an unknown icon is rejected", () => {
  const c = clone();
  c.stats.items[1].icon = "rocket";
  assert.equal(parseVargsSection(c).success, false);
});

test("two statistics cannot share a key", () => {
  const c = clone();
  c.stats.items[1].key = c.stats.items[0].key;
  const r = parseVargsSection(c);
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("stats.items.1.key"));
});

test("at most four statistics fit across the strip", () => {
  const c = clone();
  const extra = { ...c.stats.items[0], key: "x" };
  c.stats.items = [c.stats.items[0], { ...extra, key: "a" }, { ...extra, key: "b" },
                   { ...extra, key: "c" }, { ...extra, key: "d" }];
  assert.equal(parseVargsSection(c).success, false);
});

test("the strip may be emptied and switched off", () => {
  const c = clone();
  c.stats.enabled = false;
  c.stats.items = [];
  assert.equal(parseVargsSection(c).success, true);
});

test("a manual statistic takes a whole, non-negative number", () => {
  const c = clone();
  c.stats.items[0].source = "manual";
  c.stats.items[0].manual_value = -1;
  assert.equal(parseVargsSection(c).success, false);

  const d = clone();
  d.stats.items[0].source = "manual";
  d.stats.items[0].manual_value = 12.5;
  assert.equal(parseVargsSection(d).success, false);

  const e = clone();
  e.stats.items[0].source = "manual";
  e.stats.items[0].manual_value = 42;
  assert.equal(parseVargsSection(e).success, true);
});

test("a number arriving as a string is accepted and coerced", () => {
  const c = clone();
  c.stats.items[0].source = "manual";
  c.stats.items[0].manual_value = "7";
  const r = parseVargsSection(c);
  assert.equal(r.success, true);
  assert.equal(r.data.stats.items[0].manual_value, 7);
});

test("a statistic key is a slug", () => {
  const c = clone();
  c.stats.items[0].key = "Active Vargs";
  assert.equal(parseVargsSection(c).success, false);
});

// ── Atlas and list ──────────────────────────────────────────────────────────

test("the ordering choices are limited to the listed ones", () => {
  const c = clone();
  c.atlas.division_order = "alphabetical";
  assert.equal(parseVargsSection(c).success, false);

  for (const value of ORDER_SOURCE_VALUES) {
    const d = clone();
    d.atlas.division_order = value;
    d.atlas.district_order = value;
    assert.equal(parseVargsSection(d).success, true, value);
  }
});

test("the page size is held between three and twenty-four", () => {
  const low = clone(); low.list.page_size = 2;
  assert.equal(parseVargsSection(low).success, false);

  const high = clone(); high.list.page_size = 25;
  assert.equal(parseVargsSection(high).success, false);

  const ok = clone(); ok.list.page_size = 9;
  assert.equal(parseVargsSection(ok).success, true);
});

test("a page size that is not a whole number is rejected", () => {
  const c = clone();
  c.list.page_size = 6.5;
  assert.equal(parseVargsSection(c).success, false);
});

test("over-long text is rejected rather than truncated", () => {
  const c = clone();
  c.text.title_mr = "अ".repeat(121);
  assert.equal(parseVargsSection(c).success, false);
});

test("a missing block is reported, not silently defaulted", () => {
  const c = clone();
  delete c.card;
  const r = parseVargsSection(c);
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("card"));
});
