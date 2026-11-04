// Excel import of Amrut Varg activity records: header matching, cell text,
// row rules (the public form's, via its schema), duplicates, and the
// template read back through the importer.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  COLUMNS, SHEET, IMPORT_MAX_ROWS, columnKeyFor, cellText, normaliseMobile, normaliseFrequency,
  indexMasters, mastersInScope, districtInScope, checkRow, checkRows, markDuplicates, duplicateKey,
  summarise, publicRows, readSheet, buildTemplate, zipUnpackedSize,
} from "./activities.import.js";

const MASTERS = {
  divisions: [
    { id: 2, name_mr: "पुणे", name_en: "Pune", former_names: [] },
    { id: 3, name_mr: "नाशिक", name_en: "Nashik", former_names: [] },
  ],
  districts: [
    { id: 16, vibhag_id: 2, name_mr: "पुणे", name_en: "Pune", former_names: [] },
    { id: 17, vibhag_id: 2, name_mr: "सातारा", name_en: "Satara", former_names: [] },
    { id: 30, vibhag_id: 3, name_mr: "नाशिक", name_en: "Nashik", former_names: [] },
    { id: 31, vibhag_id: 3, name_mr: "अहिल्यानगर", name_en: "Ahilyanagar", former_names: ["अहमदनगर", "Ahmednagar"] },
  ],
  // Only Pune's talukas are in the master; elsewhere the taluka is typed.
  talukas: [
    { id: 101, district_id: 16, name_mr: "हवेली", name_en: "Haveli", former_names: [] },
    { id: 102, district_id: 16, name_mr: "मावळ", name_en: "Maval", former_names: [] },
  ],
};
const INDEX = indexMasters(MASTERS);
const STATE = { level: "state", vibhagId: null, districtId: null };

const RAW = {
  division: "Pune",
  district: "Pune",
  taluka: "Haveli",
  institution_name: "जिल्हा परिषद शाळा, वाघोली",
  incharge_name: "सुनीता पाटील",
  incharge_mobile: "",
  participant_count: "42",
  frequency: "Weekly",
  description: "",
};
const check = (over = {}, scope = STATE) => checkRow({ row: 2, raw: { ...RAW, ...over } }, INDEX, scope);
const fieldsOf = (r) => r.errors.map((e) => e.field);

// ── Headers and cells ───────────────────────────────────────────────────────

test("headers are matched in Marathi, English, the template's form and the CSV export's", () => {
  assert.equal(columnKeyFor("विभागाचे नाव"), "division");
  assert.equal(columnKeyFor("Division Name *"), "division");
  assert.equal(columnKeyFor("  division  name "), "division");
  assert.equal(columnKeyFor("विभागाचे नाव\nDivision Name *"), "division");
  assert.equal(columnKeyFor("Contact Number of In-charge (optional)"), "incharge_mobile");
  assert.equal(columnKeyFor("School / Institution"), "institution_name");
  assert.equal(columnKeyFor("Amrut Varg Pramukh"), "incharge_name");
  assert.equal(columnKeyFor("Students / Participants"), "participant_count");
  assert.equal(columnKeyFor("Submitted At"), null);
});

test("cell values of every kind read as text", () => {
  assert.equal(cellText(null), "");
  assert.equal(cellText("x"), "x");
  assert.equal(cellText(9876543210), "9876543210");
  assert.equal(cellText(42), "42");
  assert.equal(cellText(true), "TRUE");
  assert.equal(cellText(new Date("2026-11-03T00:00:00Z")), "2026-11-03");
  assert.equal(cellText({ richText: [{ text: "Zilla " }, { text: "Parishad" }] }), "Zilla Parishad");
  assert.equal(cellText({ formula: "A1", result: 7 }), "7");
  assert.equal(cellText({ formula: "A1" }), "");
  assert.equal(cellText({ text: "link", hyperlink: "https://x" }), "link");
  assert.equal(cellText({ error: "#N/A" }), "");
});

test("mobile numbers lose spacing and the +91 / 0 prefix", () => {
  assert.equal(normaliseMobile("98765 43210"), "9876543210");
  assert.equal(normaliseMobile("+91 98765-43210"), "9876543210");
  assert.equal(normaliseMobile("919876543210"), "9876543210");
  assert.equal(normaliseMobile("09876543210"), "9876543210");
  assert.equal(normaliseMobile("12345"), "12345");
});

test("frequency accepts English or Marathi in any case", () => {
  assert.equal(normaliseFrequency("weekly"), "WEEKLY");
  assert.equal(normaliseFrequency(" DAILY "), "DAILY");
  assert.equal(normaliseFrequency("मासिक"), "MONTHLY");
  assert.equal(normaliseFrequency("Yearly"), "Yearly");
  assert.equal(normaliseFrequency(""), "");
});

// ── Row rules ───────────────────────────────────────────────────────────────

test("a complete row passes and resolves the masters", () => {
  const r = check();
  assert.deepEqual(r.errors, []);
  assert.equal(r.data.division_id, 2);
  assert.equal(r.data.district_id, 16);
  assert.equal(r.data.taluka_id, 101);
  assert.equal(r.data.taluka, "हवेली", "a listed taluka is stored under its Marathi name");
  assert.equal(r.data.participant_count, 42);
  assert.equal(r.data.frequency, "WEEKLY");
  assert.equal(r.values.frequency, "Weekly");
});

test("every field the form requires is required in the sheet", () => {
  for (const key of COLUMNS.filter((c) => c.required).map((c) => c.key)) {
    const r = check({ [key]: "" });
    assert.equal(r.data, null, key);
    assert.ok(fieldsOf(r).includes(key), `${key}: ${JSON.stringify(r.errors)}`);
  }
});

test("the form's optional fields may be blank", () => {
  const r = check({ incharge_mobile: "", description: "" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.data.incharge_mobile, "");
  assert.equal(r.data.description, "");
});

test("whitespace-only cells count as empty", () => {
  assert.ok(fieldsOf(check({ institution_name: "   " })).includes("institution_name"));
  assert.ok(fieldsOf(check({ incharge_name: "\n\t" })).includes("incharge_name"));
});

test("names are matched in Marathi, English or a former name", () => {
  assert.deepEqual(check({ division: "पुणे", district: "पुणे", taluka: "हवेली" }).errors, []);
  const r = check({ division: "Nashik", district: "Ahmednagar", taluka: "Rahuri" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.data.district_id, 31);
  assert.equal(r.data.taluka_id, null, "a district without listed talukas takes a typed taluka");
  assert.equal(r.data.taluka, "Rahuri");
});

test("division, district and taluka must fit together", () => {
  assert.ok(fieldsOf(check({ division: "Konkan" })).includes("division"));
  assert.ok(fieldsOf(check({ district: "Mumbai" })).includes("district"));
  const wrongDivision = check({ division: "Nashik", district: "Pune" });
  assert.ok(fieldsOf(wrongDivision).includes("district"));
  assert.match(wrongDivision.errors[0].message, /Pune division, not Nashik/);
  assert.ok(fieldsOf(check({ taluka: "Rahuri" })).includes("taluka"), "Pune lists its talukas");
});

test("rows outside the caller's jurisdiction are refused", () => {
  const district = { level: "district", vibhagId: 2, districtId: 17 };
  const division = { level: "division", vibhagId: 3, districtId: null };
  assert.match(check({}, district).errors[0].message, /outside your jurisdiction/);
  assert.ok(fieldsOf(check({}, division)).includes("district"));
  assert.deepEqual(check({ division: "Nashik", district: "Nashik", taluka: "Niphad" }, division).errors, []);
  assert.ok(fieldsOf(check({}, { level: "none" })).includes("district"));
});

test("student count and mobile follow the form's rules", () => {
  for (const bad of ["0", "-3", "2.5", "abc", "100001"]) {
    assert.ok(fieldsOf(check({ participant_count: bad })).includes("participant_count"), bad);
  }
  assert.equal(check({ participant_count: "100000" }).data.participant_count, 100000);
  assert.equal(check({ incharge_mobile: "+91 98765 43210" }).data.incharge_mobile, "9876543210");
  assert.ok(fieldsOf(check({ incharge_mobile: "12345" })).includes("incharge_mobile"));
  assert.ok(fieldsOf(check({ frequency: "Fortnightly" })).includes("frequency"));
});

test("text limits are the form's", () => {
  assert.ok(fieldsOf(check({ institution_name: "x".repeat(301) })).includes("institution_name"));
  assert.ok(fieldsOf(check({ description: "x".repeat(2001) })).includes("description"));
  assert.deepEqual(check({ description: "x".repeat(2000) }).errors, []);
});

test("errors are listed in column order, one per column", () => {
  const r = check({ frequency: "", division: "", institution_name: "" });
  assert.deepEqual(fieldsOf(r), ["division", "institution_name", "frequency"]);
  assert.equal(r.errors[0].message, "Division is required");
});

test("a school repeated in the sheet or already on record is skipped", () => {
  const rows = [
    { row: 2, raw: { ...RAW } },
    { row: 3, raw: { ...RAW, institution_name: "  जिल्हा परिषद  शाळा, वाघोली " } },
    { row: 4, raw: { ...RAW, institution_name: "New School" } },
    { row: 5, raw: { ...RAW, institution_name: "Recorded School" } },
  ];
  const checked = checkRows(rows, INDEX, STATE);
  markDuplicates(checked, new Map([[duplicateKey(16, "recorded school"), 9]]));
  assert.deepEqual(checked.map((r) => Boolean(r.data)), [true, false, true, false]);
  assert.match(checked[1].errors[0].message, /row 2/);
  assert.match(checked[3].errors[0].message, /#9/);
  assert.deepEqual(summarise(checked), { total: 4, valid: 2, invalid: 2 });
  assert.equal("data" in publicRows(checked)[0], false, "internal data never leaves the server");
});

test("the template's masters are the caller's jurisdiction", () => {
  const scoped = mastersInScope(MASTERS, { level: "district", vibhagId: 2, districtId: 16 });
  assert.deepEqual(scoped.divisions.map((d) => d.id), [2]);
  assert.deepEqual(scoped.districts.map((d) => d.id), [16]);
  assert.equal(scoped.talukas.length, 2);
  assert.equal(districtInScope(STATE, MASTERS.districts[2]), true);
});

// ── Workbooks ───────────────────────────────────────────────────────────────

async function filledTemplate(rows, masters = MASTERS) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplate(masters));
  const ws = wb.getWorksheet(SHEET.data);
  rows.forEach((values, i) => {
    COLUMNS.forEach((c, j) => { if (values[c.key] !== undefined) ws.getRow(i + 2).getCell(j + 1).value = values[c.key]; });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("the template has the data sheet, instructions and lists, with dropdowns", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplate(MASTERS));
  assert.deepEqual(wb.worksheets.map((w) => w.name), [SHEET.data, SHEET.lists, SHEET.guide]);
  const ws = wb.getWorksheet(SHEET.data);
  COLUMNS.forEach((c, i) => assert.equal(columnKeyFor(cellText(ws.getRow(1).getCell(i + 1).value)), c.key));
  assert.equal(ws.getCell("A2").dataValidation?.type, "list");
  assert.equal(ws.getCell(`H${IMPORT_MAX_ROWS + 1}`).dataValidation?.type, "list");
  assert.equal(ws.getCell("G2").dataValidation?.type, "whole");
});

test("a filled template reads back, skipping blank rows", async () => {
  const buffer = await filledTemplate([
    { ...RAW, incharge_mobile: 9876543210, participant_count: 42 },
    {},
    { ...RAW, institution_name: "Second School", frequency: "दैनिक" },
  ]);
  const { sheet, rows } = await readSheet(buffer);
  assert.equal(sheet, SHEET.data);
  assert.deepEqual(rows.map((r) => r.row), [2, 4]);
  assert.equal(rows[0].raw.incharge_mobile, "9876543210");
  const checked = checkRows(rows, INDEX, STATE);
  assert.deepEqual(checked.map((r) => r.errors), [[], []]);
  assert.equal(checked[1].data.frequency, "DAILY");
});

test("a sheet with its own header wording and column order is read", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Frequency", "School", "Pramukh", "Students", "Taluka", "District", "Division"]);
  ws.addRow(["Monthly", "ZP School", "A. Kale", 30, "Maval", "Pune", "Pune"]);
  const { rows } = await readSheet(Buffer.from(await wb.xlsx.writeBuffer()));
  const [r] = checkRows(rows, INDEX, STATE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.data.taluka_id, 102);
});

test("file-level problems are refused with a reason", async () => {
  await assert.rejects(readSheet(Buffer.from("Division,District\nPune,Pune")), /not an Excel workbook/);
  await assert.rejects(readSheet(Buffer.alloc(0)), /not an Excel workbook/);

  const missing = new ExcelJS.Workbook();
  missing.addWorksheet("Sheet1").addRow(["Division Name", "District Name"]);
  await assert.rejects(readSheet(Buffer.from(await missing.xlsx.writeBuffer())), /Required columns missing.*Taluka Name/);

  const repeated = new ExcelJS.Workbook();
  repeated.addWorksheet("Sheet1").addRow(COLUMNS.map((c) => c.en).concat("Division"));
  await assert.rejects(readSheet(Buffer.from(await repeated.xlsx.writeBuffer())), /more than once: Division Name/);

  await assert.rejects(readSheet(await filledTemplate([])), /no data rows/);
});

test("a sheet over the row limit is refused", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET.data);
  ws.addRow(COLUMNS.map((c) => c.en));
  for (let i = 0; i <= IMPORT_MAX_ROWS; i++) ws.addRow(["Pune", "Pune", "Haveli", `School ${i}`, "P", "", 5, "Daily"]);
  await assert.rejects(readSheet(Buffer.from(await wb.xlsx.writeBuffer())), /more than 1,000 rows/);
});

test("the unpacked size is read from the zip directory", async () => {
  const buffer = await buildTemplate(MASTERS);
  const size = zipUnpackedSize(buffer);
  assert.ok(size > buffer.length && size < 5 * 1024 * 1024, String(size));
  assert.equal(zipUnpackedSize(Buffer.from("not a zip at all, just text")), null);
});
