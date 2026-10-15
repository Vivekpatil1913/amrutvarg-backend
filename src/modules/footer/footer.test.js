// Validation rules for the footer's official links and social profiles.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { parseFooter } from "./footer.schema.js";
import { DEFAULT_FOOTER, PLATFORM_VALUES, LINK_ICONS } from "./footer.defaults.js";

const clone = () => JSON.parse(JSON.stringify(DEFAULT_FOOTER));

test("the shipped default configuration is valid", () => {
  const r = parseFooter(DEFAULT_FOOTER);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("the seeded links are the two the site shows today", () => {
  assert.deepEqual(DEFAULT_FOOTER.links.map((l) => l.id), ["link-portal", "link-amrut"]);
});

test("the four asked-for platforms are seeded", () => {
  assert.deepEqual(
    DEFAULT_FOOTER.social.map((s) => s.platform),
    ["facebook", "instagram", "twitter", "linkedin"]
  );
});

test("social profiles ship with no address — an invented handle would be worse", () => {
  assert.ok(DEFAULT_FOOTER.social.every((s) => s.url === ""));
});

// ── official links ──────────────────────────────────────────────────────────

test("an official link needs a Marathi title", () => {
  const c = clone();
  c.links[0].title_mr = "";
  const r = parseFooter(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "links.0.title_mr"));
});

test("an official link needs an address", () => {
  const c = clone();
  c.links[0].url = "";
  const r = parseFooter(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "links.0.url"));
});

test("a non-http link is rejected", () => {
  const c = clone();
  c.links[0].url = "javascript:alert(1)";
  assert.equal(parseFooter(c).success, false);
});

test("a relative link is rejected", () => {
  const c = clone();
  c.links[1].url = "/portal";
  assert.equal(parseFooter(c).success, false);
});

test("every allowlisted icon is accepted", () => {
  for (const icon of LINK_ICONS) {
    const c = clone();
    c.links[0].icon = icon;
    assert.equal(parseFooter(c).success, true, `icon ${icon} was rejected`);
  }
});

test("an icon outside the allowlist is rejected", () => {
  const c = clone();
  c.links[0].icon = "rocket";
  assert.equal(parseFooter(c).success, false);
});

test("a link description may be empty", () => {
  const c = clone();
  c.links[0].desc_mr = "";
  c.links[0].desc_en = "";
  assert.equal(parseFooter(c).success, true);
});

test("duplicate link ids are rejected", () => {
  const c = clone();
  c.links[1].id = c.links[0].id;
  const r = parseFooter(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => /Duplicate id/.test(i.message)));
});

test("the links list may be emptied — the footer column simply disappears", () => {
  const c = clone();
  c.links = [];
  assert.equal(parseFooter(c).success, true);
});

// ── social profiles ─────────────────────────────────────────────────────────

test("every allowlisted platform is accepted", () => {
  for (const platform of PLATFORM_VALUES) {
    const c = clone();
    c.social = [{ id: "soc-x", platform, url: "https://example.com/a", label_mr: "", label_en: "", enabled: true }];
    assert.equal(parseFooter(c).success, true, `platform ${platform} was rejected`);
  }
});

test("custom platform names are accepted when paired with a supported icon", () => {
  const c = clone();
  c.social[0].platform = "Mastodon";
  c.social[0].icon = "link";
  assert.equal(parseFooter(c).success, true);
});

test("the same platform may have multiple profile links", () => {
  const c = clone();
  c.social[1].platform = c.social[0].platform;
  assert.equal(parseFooter(c).success, true);
});

test("a social profile with no address is valid — it just hides the icon", () => {
  const c = clone();
  c.social.forEach((s) => { s.url = ""; });
  assert.equal(parseFooter(c).success, true);
});

test("a filled social address must be a full http(s) address", () => {
  const c = clone();
  c.social[0].url = "facebook.com/amrutvarg";
  const r = parseFooter(c);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.path.join(".") === "social.0.url"));
});

test("a social profile accepts a real address", () => {
  const c = clone();
  c.social[0].url = "https://www.facebook.com/amrutvarg";
  assert.equal(parseFooter(c).success, true);
});

test("up to 30 custom social profiles are accepted", () => {
  const c = clone();
  c.social = Array.from({ length: 30 }, (_, i) => ({
    id: `soc-${i}`,
    platform: `Network ${i}`,
    icon: "link",
    url: "",
    label_mr: "",
    label_en: "",
    enabled: true,
  }));
  assert.equal(parseFooter(c).success, true);
  c.social.push({ id: "soc-31", platform: "Too many", icon: "link", url: "", label_mr: "", label_en: "", enabled: true });
  assert.equal(parseFooter(c).success, false);
});

test("a disabled row still validates — hiding is not deleting", () => {
  const c = clone();
  c.links[0].enabled = false;
  c.social[0].enabled = false;
  assert.equal(parseFooter(c).success, true);
});

test("text is trimmed on the way in", () => {
  const c = clone();
  c.links[0].title_mr = "  अमृत वर्ग पोर्टल  ";
  const r = parseFooter(c);
  assert.equal(r.success, true);
  assert.equal(r.data.links[0].title_mr, "अमृत वर्ग पोर्टल");
});

test("a title past the footer column's limit is rejected", () => {
  const c = clone();
  c.links[0].title_mr = "अ".repeat(121);
  assert.equal(parseFooter(c).success, false);
});

test("arbitrary JSON is rejected", () => {
  assert.equal(parseFooter({ hello: "world" }).success, false);
});
