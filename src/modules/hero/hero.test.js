// Validation rules for the homepage hero configuration.
// Run with: npm test   (node --test, the runner already used in this project)

import test from "node:test";
import assert from "node:assert/strict";
import { parseHero } from "./hero.schema.js";
import { DEFAULT_HERO, ICONS, TARGET_VALUES } from "./hero.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_HERO));

test("the shipped default configuration is valid", () => {
  const result = parseHero(DEFAULT_HERO);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test("a Marathi heading is required", () => {
  const cfg = clone();
  cfg.text.title_mr = "";
  const result = parseHero(cfg);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((i) => i.path.join(".") === "text.title_mr"));
});

test("an English value left blank is allowed", () => {
  const cfg = clone();
  cfg.text.tagline_en = "";
  assert.equal(parseHero(cfg).success, true);
});

test("a destination outside the allowlist is rejected", () => {
  const cfg = clone();
  cfg.ctas[0].target = "https://evil.example.com";
  const result = parseHero(cfg);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((i) => i.path.includes("target")));
});

test("every allowlisted destination is accepted", () => {
  for (const target of TARGET_VALUES) {
    const cfg = clone();
    cfg.ctas[0].target = target;
    assert.equal(parseHero(cfg).success, true, `rejected ${target}`);
  }
});

test("an icon the frontend cannot render is rejected", () => {
  const cfg = clone();
  cfg.quicknav[0].icon = "not-a-real-icon";
  assert.equal(parseHero(cfg).success, false);
});

test("every allowlisted icon is accepted", () => {
  for (const icon of ICONS) {
    const cfg = clone();
    cfg.ctas[0].icon = icon;
    assert.equal(parseHero(cfg).success, true, `rejected ${icon}`);
  }
});

test("a manual statistic needs a value", () => {
  const cfg = clone();
  cfg.stats.push({
    id: "stat-empty", label_mr: "चाचणी", label_en: "Test",
    value_mr: "", value_en: "", source: "manual", enabled: true,
  });
  const result = parseHero(cfg);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((i) => i.path.includes("value_mr")));
});

test("a counted statistic needs no typed value", () => {
  const cfg = clone();
  const counted = cfg.stats.find((s) => s.source === "vargs_count");
  assert.equal(counted.value_mr, "");
  assert.equal(parseHero(cfg).success, true);
});

test("an unknown statistic source is rejected", () => {
  const cfg = clone();
  cfg.stats[0].source = "made_up_count";
  assert.equal(parseHero(cfg).success, false);
});

test("duplicate item ids are rejected", () => {
  const cfg = clone();
  cfg.quicknav[1].id = cfg.quicknav[0].id;
  const result = parseHero(cfg);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((i) => i.message.startsWith("Duplicate id")));
});

test("over-long text is rejected rather than silently truncated", () => {
  const cfg = clone();
  cfg.text.desc_mr = "अ".repeat(601);
  assert.equal(parseHero(cfg).success, false);
});

test("more than two CTA buttons is rejected", () => {
  const cfg = clone();
  cfg.ctas.push({
    id: "cta-third", label_mr: "तिसरे", label_en: "Third",
    icon: "search", target: "#about", enabled: true,
  });
  assert.equal(parseHero(cfg).success, false);
});

test("a media reference must be a positive integer or null", () => {
  const cfg = clone();
  cfg.images.main.media_id = -3;
  assert.equal(parseHero(cfg).success, false);

  const ok = clone();
  ok.images.main.media_id = null;
  assert.equal(parseHero(ok).success, true);
});

test("disabled items survive validation so they can be re-enabled later", () => {
  const cfg = clone();
  cfg.stats[0].enabled = false;
  cfg.quicknav[2].enabled = false;
  const result = parseHero(cfg);
  assert.equal(result.success, true);
  assert.equal(result.data.stats[0].enabled, false);
  assert.equal(result.data.quicknav[2].enabled, false);
});

test("text is trimmed on the way in", () => {
  const cfg = clone();
  cfg.text.title_mr = "  अमृत वर्ग  ";
  const result = parseHero(cfg);
  assert.equal(result.success, true);
  assert.equal(result.data.text.title_mr, "अमृत वर्ग");
});
