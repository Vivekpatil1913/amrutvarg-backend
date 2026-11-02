// Field validation and CSV encoding for Amrut Varg activity records.
// Run with: npm test
//
// The relationship checks (district belongs to division, taluka belongs to
// district) and the minimum-photo rule need the database and the uploaded
// files, and are covered by the route.

import test from "node:test";
import assert from "node:assert/strict";
import { activitySchema, filterSchema, csvCell, toCsv, MAX } from "./activities.schema.js";

// Multipart bodies arrive as strings.
const VALID = {
  division_id: "2",
  district_id: "16",
  taluka_id: "",
  taluka: "हवेली",
  institution_name: "जिल्हा परिषद शाळा, वाघोली",
  incharge_name: "सुनीता पाटील",
  incharge_mobile: "",
  participant_count: "42",
  frequency: "WEEKLY",
  description: "",
};

const parse = (over = {}) => activitySchema.safeParse({ ...VALID, ...over });
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("a complete activity record is valid and coerced", () => {
  const r = parse();
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
  assert.equal(r.data.division_id, 2);
  assert.equal(r.data.participant_count, 42);
  assert.equal(r.data.taluka_id, null);
});

test("every mandatory field is required", () => {
  for (const key of ["division_id", "district_id", "taluka", "institution_name", "incharge_name", "participant_count", "frequency"]) {
    const r = parse({ [key]: "" });
    assert.equal(r.success, false, key);
    assert.ok(fieldsOf(r).includes(key), key);
  }
});

test("whitespace-only text is treated as empty", () => {
  assert.ok(fieldsOf(parse({ institution_name: "   " })).includes("institution_name"));
  assert.ok(fieldsOf(parse({ incharge_name: "\t " })).includes("incharge_name"));
});

test("frequency is restricted to Daily, Weekly or Monthly", () => {
  for (const ok of ["DAILY", "WEEKLY", "MONTHLY"]) assert.equal(parse({ frequency: ok }).success, true, ok);
  for (const bad of ["Yearly", "daily", "FORTNIGHTLY"]) assert.ok(fieldsOf(parse({ frequency: bad })).includes("frequency"), bad);
});

test("student count must be a positive whole number", () => {
  for (const bad of ["0", "-3", "2.5", "abc", "1e3"]) {
    assert.ok(fieldsOf(parse({ participant_count: bad })).includes("participant_count"), bad);
  }
  assert.ok(fieldsOf(parse({ participant_count: String(MAX.participants + 1) })).includes("participant_count"));
});

test("contact number is optional but must be a 10-digit mobile when given", () => {
  assert.equal(parse({ incharge_mobile: "" }).success, true);
  assert.equal(parse({ incharge_mobile: "9876543210" }).success, true);
  // The PRD rule is exactly ten digits: /^[0-9]{10}$/.
  assert.equal(parse({ incharge_mobile: "0123456789" }).success, true);
  for (const bad of ["12345", "98765432101", "98765-4321", "+919876543"]) {
    assert.ok(fieldsOf(parse({ incharge_mobile: bad })).includes("incharge_mobile"), bad);
  }
});

test("filters accept blanks and reject unknown frequencies", () => {
  assert.deepEqual(filterSchema.parse({}), { division_id: "", district_id: "", frequency: "", search: "" });
  assert.equal(filterSchema.parse({ division_id: "3" }).division_id, 3);
  assert.equal(filterSchema.safeParse({ frequency: "YEARLY" }).success, false);
});

test("CSV cells are quoted and formula-safe", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('a "quoted", value'), '"a ""quoted"", value"');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(42), "42");
  assert.equal(toCsv(["A", "B"], [[1, "x,y"]]), 'A,B\r\n1,"x,y"');
});
