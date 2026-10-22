// Field validation for a district office.
// Run with: npm test
//
// The uniqueness rule (one live office per district) needs the database and is
// covered by the route. What is pinned here is the shape of the record — and
// in particular that a half-known office is a legitimate record, because the
// point of this table is to publish what has been confirmed and nothing else.

import test from "node:test";
import assert from "node:assert/strict";
import { officeSchema, MAX } from "./offices.schema.js";

const FULL = {
  district_id: 4,
  office_name_mr: "जिल्हाधिकारी कार्यालय, पुणे",
  office_name_en: "Collector Office, Pune",
  collector_name: "—",
  collector_designation: "जिल्हाधिकारी",
  address: "कौन्सिल हॉल, पुणे",
  phone: "02026123456".slice(0, 10),
  email: "collector.pune@example.gov.in",
  hours: "सोमवार–शुक्रवार, १०:००–१७:४५",
  website_url: "https://pune.example.gov.in/",
  map_url: "https://maps.example.com/?q=pune",
  is_active: true,
};

const parse = (over = {}) => officeSchema.safeParse({ ...FULL, ...over });
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("a fully filled office is valid", () => {
  const r = officeSchema.safeParse(FULL);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

// ── the district ────────────────────────────────────────────────────────────

test("a district is required and must be a positive id", () => {
  for (const bad of [undefined, null, 0, -1, 1.5, "4", ""]) {
    const r = parse({ district_id: bad });
    assert.equal(r.success, false, String(bad));
    assert.ok(fieldsOf(r).includes("district_id"), String(bad));
  }
  assert.equal(parse({ district_id: 12 }).success, true);
});

// ── partial records are the normal case ─────────────────────────────────────

test("an office with only one confirmed detail is valid", () => {
  const onlyCollector = officeSchema.safeParse({ district_id: 4, collector_name: "—" });
  assert.equal(onlyCollector.success, true, JSON.stringify(onlyCollector.error?.issues));

  const onlyWebsite = officeSchema.safeParse({ district_id: 4, website_url: "https://pune.example.gov.in/" });
  assert.equal(onlyWebsite.success, true, JSON.stringify(onlyWebsite.error?.issues));
});

test("unfilled details default to empty rather than to invented values", () => {
  const r = officeSchema.safeParse({ district_id: 4, collector_name: "—" });
  assert.equal(r.data.address, "");
  assert.equal(r.data.phone, "");
  assert.equal(r.data.email, "");
  assert.equal(r.data.hours, "");
  assert.equal(r.data.website_url, "");
  assert.equal(r.data.map_url, "");
});

test("an office with NO details at all is refused", () => {
  // It would publish nothing while making the district look documented.
  const r = officeSchema.safeParse({ district_id: 4 });
  assert.equal(r.success, false);
  const blanks = officeSchema.safeParse({ district_id: 4, collector_name: "   ", address: "  " });
  assert.equal(blanks.success, false, "whitespace is not a detail");
});

// ── trimming ────────────────────────────────────────────────────────────────

test("surrounding whitespace is trimmed off every text field", () => {
  const r = parse({ collector_name: "  नाव  ", address: "  पत्ता  ", hours: "  १०–५  " });
  assert.equal(r.data.collector_name, "नाव");
  assert.equal(r.data.address, "पत्ता");
  assert.equal(r.data.hours, "१०–५");
});

test("over-long values are refused", () => {
  assert.equal(parse({ address: "अ".repeat(MAX.address + 1) }).success, false);
  assert.equal(parse({ collector_name: "अ".repeat(MAX.collector + 1) }).success, false);
  assert.equal(parse({ office_name_mr: "अ".repeat(MAX.officeName) }).success, true);
});

// ── phone and email ─────────────────────────────────────────────────────────

test("a phone number is optional but must be ten digits when given", () => {
  assert.equal(parse({ phone: "" }).success, true);
  assert.equal(parse({ phone: "9876543210" }).data.phone, "9876543210");
  // Spacing and a country code are normalised away, as elsewhere on the site.
  assert.equal(parse({ phone: "+91 98765 43210" }).data.phone, "9876543210");
  assert.equal(parse({ phone: "12345" }).success, false);
  assert.equal(parse({ phone: "not a number" }).success, false);
});

test("an email is optional but must look like an address when given", () => {
  assert.equal(parse({ email: "" }).success, true);
  assert.equal(parse({ email: "collector@example.gov.in" }).success, true);
  for (const bad of ["collector", "collector@", "@example.gov.in", "a b@example.gov.in"]) {
    assert.equal(parse({ email: bad }).success, false, bad);
  }
});

// ── links ───────────────────────────────────────────────────────────────────

test("a website or map link must be one a browser can open", () => {
  assert.equal(parse({ website_url: "", map_url: "" }).success, true);
  assert.equal(parse({ website_url: "https://pune.example.gov.in/" }).success, true);
  assert.equal(parse({ website_url: "http://pune.example.gov.in/" }).success, true);
  for (const bad of [
    "javascript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "pune.example.gov.in",
  ]) {
    assert.equal(parse({ website_url: bad }).success, false, bad);
    assert.equal(parse({ map_url: bad }).success, false, bad);
  }
});

test("an office defaults to active", () => {
  const r = officeSchema.safeParse({ district_id: 4, collector_name: "—" });
  assert.equal(r.data.is_active, true);
  assert.equal(parse({ is_active: false }).data.is_active, false);
});
