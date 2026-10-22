// Field validation for an Amrut Varg — the record that describes one school.
// Run with: npm test
//
// The relationship checks (district belongs to vibhag, taluka belongs to
// district) need the database and are covered by the route; this file pins the
// field rules, which are what the admin form mirrors.

import test from "node:test";
import assert from "node:assert/strict";
import { vargSchema, MAX } from "./vargs.schema.js";
import { isSafeHttpUrl } from "../../lib/mediaUrl.js";

const VALID = {
  vibhag_mr: "पुणे",
  vibhag_en: "Pune",
  district_mr: "पुणे",
  district_en: "Pune",
  taluka: "हवेली",
  district_id: 4,
  taluka_id: 11,
  village: "वाघोली",
  school_name: "महाराष्ट्र विद्यालय, पुणे",
  varg_name: "",
  coordinator_name: "",
  enrollment_count: 40,
  is_active: true,
  display_order: 0,
  resource_url: "",
};

const parse = (over = {}) => vargSchema.safeParse({ ...VALID, ...over });
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("a complete school record is valid", () => {
  const r = vargSchema.safeParse(VALID);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

// ── REQ-08: school name ─────────────────────────────────────────────────────

test("a school name is required", () => {
  const r = parse({ school_name: "" });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("school_name"));
});

test("a whitespace-only school name is rejected", () => {
  // The previous rule measured length before trimming, so "   " counted as
  // three characters and was accepted.
  for (const blank of ["   ", "\t", "\n", " \t \n "]) {
    const r = parse({ school_name: blank });
    assert.equal(r.success, false, JSON.stringify(blank));
    assert.ok(fieldsOf(r).includes("school_name"), JSON.stringify(blank));
  }
});

test("surrounding whitespace is trimmed off the school name", () => {
  const r = parse({ school_name: "   महाराष्ट्र विद्यालय   " });
  assert.equal(r.success, true);
  assert.equal(r.data.school_name, "महाराष्ट्र विद्यालय");
});

test("a school name at the limit is kept and one past it is rejected", () => {
  assert.equal(parse({ school_name: "अ".repeat(MAX.school) }).success, true);
  assert.equal(parse({ school_name: "अ".repeat(MAX.school + 1) }).success, false);
});

// ── REQ-07/08: district and taluka ──────────────────────────────────────────

test("a district is required; a taluka is not", () => {
  assert.equal(parse({ district_mr: "" }).success, false);
  assert.equal(parse({ district_mr: "   " }).success, false);
  // Optional by existing business rule: the taluka master covers only a
  // fraction of Maharashtra, so requiring it would block most districts.
  assert.equal(parse({ taluka: "", taluka_id: null }).success, true);
});

test("a division is required", () => {
  assert.equal(parse({ vibhag_mr: "" }).success, false);
  assert.equal(parse({ vibhag_mr: "  " }).success, false);
});

test("location ids must be positive integers when given", () => {
  for (const bad of [0, -1, 1.5, "abc", "7"]) {
    assert.equal(parse({ district_id: bad }).success, false, String(bad));
  }
  assert.equal(parse({ district_id: 12 }).success, true);
});

test("an absent, null or empty location id all mean \"not chosen\"", () => {
  assert.equal(parse({ district_id: null }).data.district_id, null);
  assert.equal(parse({ district_id: "" }).data.district_id, null);
  const { district_id: _omit, ...without } = VALID;
  assert.equal(vargSchema.safeParse(without).data.district_id, null);
});

// ── REQ-09: village ─────────────────────────────────────────────────────────

test("a village name is optional", () => {
  const r = parse({ village: "" });
  assert.equal(r.success, true);
  assert.equal(r.data.village, "");
  const { village: _omit, ...without } = VALID;
  assert.equal(vargSchema.safeParse(without).data.village, "");
});

test("a whitespace-only village name is stored as empty, not as blanks", () => {
  const r = parse({ village: "    " });
  assert.equal(r.success, true);
  assert.equal(r.data.village, "");
});

test("surrounding whitespace is trimmed off the village name", () => {
  assert.equal(parse({ village: "  वाघोली  " }).data.village, "वाघोली");
});

test("regional-language village names are accepted", () => {
  for (const name of ["वाघोली", "काटेवाडी", "Wagholi", "शिरूर–पुणे", "म्हाळुंगे बु॥"]) {
    const r = parse({ village: name });
    assert.equal(r.success, true, name);
    assert.equal(r.data.village, name, name);
  }
});

test("an over-long village name is rejected", () => {
  assert.equal(parse({ village: "अ".repeat(MAX.village) }).success, true);
  const r = parse({ village: "अ".repeat(MAX.village + 1) });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("village"));
});

// ── numbers and the resource URL ────────────────────────────────────────────

test("enrollment must be a whole number within range", () => {
  assert.equal(parse({ enrollment_count: -1 }).success, false);
  assert.equal(parse({ enrollment_count: 1.5 }).success, false);
  assert.equal(parse({ enrollment_count: MAX.enrollment + 1 }).success, false);
  assert.equal(parse({ enrollment_count: 0 }).success, true);
});

test("a school resource URL is optional but must be openable", () => {
  assert.equal(parse({ resource_url: "" }).success, true);
  assert.equal(parse({ resource_url: "https://school.example.org/" }).success, true);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "school.example.org"]) {
    assert.equal(parse({ resource_url: bad }).success, false, bad);
  }
  // Same guard the public page uses to decide whether to render it at all.
  assert.equal(isSafeHttpUrl("https://school.example.org/"), true);
});
