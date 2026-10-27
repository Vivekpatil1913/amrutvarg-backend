// Field rules for Amrut Varg Melawa announcements, and the jurisdiction
// levels behind who may publish them. Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { melawaSchema } from "./melawa.schema.js";
import { scopeOf, scopeSql } from "../../lib/scope.js";

const VALID = {
  title_mr: "पुणे जिल्हा अमृत वर्ग मेळावा",
  title_en: "Pune District Amrut Varg Melawa",
  event_date: "2026-11-15",
  start_time: "10:00",
  end_time: "16:00",
  venue_mr: "बालगंधर्व रंगमंदिर, पुणे",
  maps_url: "https://maps.google.com/?q=Balgandharva",
  jurisdiction_scope: "DISTRICT",
  target_district_id: 8,
};

const parse = (over = {}) => melawaSchema.safeParse({ ...VALID, ...over });
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("a complete district melawa is valid", () => {
  const r = parse();
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
  assert.equal(r.data.end_date, null);
});

test("single-day event must end after it starts", () => {
  assert.deepEqual(fieldsOf(parse({ end_time: "09:00" })), ["end_time"]);
});

test("multi-day event may close earlier in the day than it opened", () => {
  assert.equal(parse({ end_date: "2026-11-16", end_time: "09:00" }).success, true);
  assert.deepEqual(fieldsOf(parse({ end_date: "2026-11-14" })), ["end_date"]);
});

test("each scope names its own target", () => {
  assert.equal(parse({ jurisdiction_scope: "STATE", target_district_id: null }).success, true);
  assert.deepEqual(fieldsOf(parse({ jurisdiction_scope: "DIVISION", target_district_id: null })), ["target_division_id"]);
  assert.deepEqual(fieldsOf(parse({ target_district_id: null })), ["target_district_id"]);
});

test("map link must be an http(s) address", () => {
  assert.deepEqual(fieldsOf(parse({ maps_url: "javascript:alert(1)" })), ["maps_url"]);
  assert.equal(parse({ maps_url: "" }).success, true);
});

test("invalid dates and clock times are rejected", () => {
  assert.ok(fieldsOf(parse({ event_date: "2026-02-30" })).includes("event_date"));
  assert.ok(fieldsOf(parse({ start_time: "25:00" })).includes("start_time"));
});

test("scope levels follow the role and its assignment", () => {
  assert.equal(scopeOf({ role: "superadmin" }).level, "state");
  assert.equal(scopeOf({ role: "admin" }).level, "state");
  assert.equal(scopeOf({ role: "state_coordinator" }).level, "state");
  assert.deepEqual(scopeOf({ role: "division_manager", vibhagId: 2 }), { level: "division", vibhagId: 2, districtId: null });
  assert.equal(scopeOf({ role: "district_manager", vibhagId: 2, districtId: 8 }).level, "district");
  // An unassigned manager sees nothing rather than everything.
  assert.equal(scopeOf({ role: "district_manager" }).level, "none");
  assert.equal(scopeOf({ role: "division_manager" }).level, "none");
});

test("scope SQL confines queries to the jurisdiction", () => {
  let params = [];
  assert.equal(scopeSql({ role: "state_coordinator" }, { district: "d" }, params), "TRUE");
  params = [];
  assert.equal(scopeSql({ role: "district_manager", districtId: 8 }, { district: "g.district_id" }, params), "g.district_id = $1");
  assert.deepEqual(params, [8]);
  params = ["x"];
  assert.equal(scopeSql({ role: "division_manager", vibhagId: 2 }, { district: "g.district_id", division: "g.division_id" }, params), "g.division_id = $2");
  params = [];
  assert.match(scopeSql({ role: "division_manager", vibhagId: 2 }, { district: "district_id" }, params), /IN \(SELECT id FROM districts WHERE vibhag_id = \$1\)/);
  assert.equal(scopeSql({ role: "district_manager" }, { district: "d" }, []), "FALSE");
});
