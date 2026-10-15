// Validation rules for the District Directory page wording.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseDirectory } from "./directory.schema.js";
import { DEFAULT_DIRECTORY } from "./directory.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_DIRECTORY));

test("the shipped default configuration is valid", () => {
  const r = parseDirectory(DEFAULT_DIRECTORY);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("the seeded roles match the six the site renders", () => {
  assert.deepEqual(
    DEFAULT_DIRECTORY.roles.map((r) => r.id),
    ["divisionalManager", "districtManager", "dataEntry", "sakhi", "mitra", "amrutMitra"]
  );
});

test("exactly one seeded role is featured", () => {
  const featured = DEFAULT_DIRECTORY.roles.filter((r) => r.featured);
  assert.deepEqual(featured.map((r) => r.id), ["divisionalManager"]);
});

test("a Marathi heading is required", () => {
  const c = clone();
  c.text.title_mr = "";
  assert.equal(parseDirectory(c).success, false);
});

test("a whitespace-only heading is rejected", () => {
  const c = clone();
  c.text.title_mr = "   ";
  assert.equal(parseDirectory(c).success, false);
});

test("English fields may be left blank", () => {
  const c = clone();
  c.text.lead_en = "";
  c.text.no_results_en = "";
  c.roles[0].label_en = "";
  assert.equal(parseDirectory(c).success, true);
});

// ── templates ───────────────────────────────────────────────────────────────

test("the count template must keep its {n} placeholder", () => {
  const c = clone();
  c.text.count_many_mr = "संपर्क";
  const r = parseDirectory(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "text.count_many_mr"));
});

test("the paging line must keep both placeholders", () => {
  const c = clone();
  c.text.showing_en = "Showing {shown}";
  const r = parseDirectory(c);
  assert.equal(r.success, false);
  const issue = r.error.issues.find((i) => i.path.join(".") === "text.showing_en");
  assert.ok(issue, "expected an issue on text.showing_en");
  assert.match(issue.message, /\{total\}/);
});

test("the division heading must keep its {name} placeholder", () => {
  const c = clone();
  c.text.division_label_mr = "विभाग";
  const r = parseDirectory(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "text.division_label_mr"));
});

test("rewording a template around its placeholder is allowed", () => {
  const c = clone();
  c.text.showing_en = "{shown} shown out of {total} found";
  c.text.division_label_en = "Division of {name}";
  assert.equal(parseDirectory(c).success, true);
});

test("a template cannot be emptied", () => {
  const c = clone();
  c.text.count_one_mr = "";
  assert.equal(parseDirectory(c).success, false);
});

// ── roles ───────────────────────────────────────────────────────────────────

test("every role needs a Marathi label", () => {
  const c = clone();
  c.roles[2].label_mr = "";
  const r = parseDirectory(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "roles.2.label_mr"));
});

test("duplicate role ids are rejected", () => {
  const c = clone();
  c.roles[1].id = c.roles[0].id;
  const r = parseDirectory(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => /Duplicate id/.test(i.message)));
});

test("a role id with spaces or punctuation is rejected", () => {
  const c = clone();
  c.roles[0].id = "divisional manager";
  assert.equal(parseDirectory(c).success, false);
});

test("the roles list cannot be emptied", () => {
  const c = clone();
  c.roles = [];
  assert.equal(parseDirectory(c).success, false);
});

test("a new role can be added", () => {
  const c = clone();
  c.roles.push({ id: "volunteer", label_mr: "स्वयंसेवक", label_en: "Volunteer", featured: false });
  const r = parseDirectory(c);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("no role featured is allowed — every card then renders the same width", () => {
  const c = clone();
  c.roles.forEach((r) => { r.featured = false; });
  assert.equal(parseDirectory(c).success, true);
});

// ── links ───────────────────────────────────────────────────────────────────

test("a non-http link is rejected", () => {
  const c = clone();
  c.links.official_url = "javascript:alert(1)";
  const r = parseDirectory(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "links.official_url"));
});

test("a relative link is rejected", () => {
  const c = clone();
  c.links.submit_form_url = "/forms/district";
  assert.equal(parseDirectory(c).success, false);
});

test("an empty submit link is allowed — it hides the button", () => {
  const c = clone();
  c.links.submit_form_url = "";
  assert.equal(parseDirectory(c).success, true);
});

test("the state phone must be ten digits", () => {
  const c = clone();
  c.links.state_phone = "91122";
  const r = parseDirectory(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "links.state_phone"));
});

test("a phone with punctuation is rejected", () => {
  const c = clone();
  c.links.state_phone = "+91 91122 27668";
  assert.equal(parseDirectory(c).success, false);
});

test("an empty state phone is allowed — it drops the footer link", () => {
  const c = clone();
  c.links.state_phone = "";
  assert.equal(parseDirectory(c).success, true);
});

test("text is trimmed on the way in", () => {
  const c = clone();
  c.text.badge_mr = "  जिल्हा संपर्क  ";
  const r = parseDirectory(c);
  assert.equal(r.success, true);
  assert.equal(r.data.text.badge_mr, "जिल्हा संपर्क");
});

test("text past the layout's limit is rejected", () => {
  const c = clone();
  c.text.lead_mr = "अ".repeat(401);
  assert.equal(parseDirectory(c).success, false);
});

test("arbitrary JSON is rejected", () => {
  assert.equal(parseDirectory({ hello: "world" }).success, false);
});
