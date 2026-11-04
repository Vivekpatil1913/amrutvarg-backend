import ExcelJS from "exceljs";
import { activitySchema, FREQUENCIES, MAX } from "./activities.schema.js";
import { AppError } from "../../lib/errors.js";

// Bulk import of Amrut Varg activity records from an Excel (.xlsx) sheet.
//
// Every row goes through the public form's own schema, so a field that is
// required on the form is required in the sheet and an optional one stays
// optional; only the photographs cannot travel in a spreadsheet. An imported
// record is therefore saved hidden ("photo pending") together with an
// unpublished listing, and goes public once an officer adds its photographs.
//
// Everything here is pure apart from reading and writing the workbook: the
// route supplies the masters and the caller's scope, and does the inserts.

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
// A thousand rows of text is well under a megabyte unpacked; anything near
// this is a zip bomb, not a sheet.
const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;

export const SHEET = { data: "Activities", guide: "Instructions", lists: "Lists" };

// The sheet's columns, in order: the public form's fields, labelled as the
// form labels them. `aliases` also accepts the CSV export's headers, so an
// export saved as .xlsx can be read back.
export const COLUMNS = [
  { key: "division", mr: "विभागाचे नाव", en: "Division Name", required: true, width: 22, aliases: ["division", "vibhag"] },
  { key: "district", mr: "जिल्ह्याचे नाव", en: "District Name", required: true, width: 22, aliases: ["district"] },
  { key: "taluka", mr: "तालुक्याचे नाव", en: "Taluka Name", required: true, width: 22, aliases: ["taluka"] },
  {
    key: "institution_name", mr: "शाळा / शैक्षणिक संस्थेचे नाव / ठिकाण", en: "School / Educational Institution Name / Place",
    required: true, width: 40, aliases: ["school / institution", "school", "institution"],
  },
  {
    key: "incharge_name", mr: "अमृत वर्ग प्रमुखाचे नाव", en: "Name of Amrut Varg In-charge (Pramukh)",
    required: true, width: 30, aliases: ["amrut varg pramukh", "pramukh", "in-charge"],
  },
  {
    key: "incharge_mobile", mr: "प्रमुखाचा संपर्क क्रमांक", en: "Contact Number of In-charge",
    required: false, width: 20, aliases: ["pramukh contact", "mobile", "contact number"],
  },
  {
    key: "participant_count", mr: "विद्यार्थी / सहभागी संख्या", en: "Number of Students / Participants",
    required: true, width: 18, aliases: ["students / participants", "students", "participants"],
  },
  {
    key: "frequency", mr: "अमृत वर्गाची वारंवारता / स्वरूप", en: "Frequency / Format of Amrut Varg",
    required: true, width: 20, aliases: ["frequency"],
  },
  { key: "description", mr: "उपक्रमाचे वर्णन", en: "Activity Description", required: false, width: 50, aliases: ["description"] },
];

const COLUMN = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

const FREQUENCY_NAMES = {
  DAILY: ["daily", "दैनिक"],
  WEEKLY: ["weekly", "साप्ताहिक"],
  MONTHLY: ["monthly", "मासिक"],
};
const FREQUENCY_EN = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };

// ── Text helpers ────────────────────────────────────────────────────────────

// For comparing names: Unicode-normalised, case- and spacing-insensitive.
export const norm = (s) => String(s ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

// A header as typed: the required marker and an "(optional)" note are not
// part of the name.
const normHeader = (s) =>
  norm(String(s ?? "").replace(/\*/g, " ").replace(/\((optional|required|ऐच्छिक|आवश्यक)\)/gi, " "));

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const headerText = (c) => `${c.mr}\n${c.en}${c.required ? " *" : " (optional)"}`;

const HEADER_KEY = new Map();
for (const c of COLUMNS) {
  for (const name of [c.mr, c.en, `${c.mr} ${c.en}`, headerText(c), c.key, ...c.aliases]) {
    HEADER_KEY.set(normHeader(name), c.key);
  }
}
export const columnKeyFor = (header) => HEADER_KEY.get(normHeader(header)) ?? null;

// The text of one cell, whatever ExcelJS made of it. A long mobile number
// typed into a General cell arrives as a number and is written out in full.
export function cellText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text ?? "").join("");
    if ("formula" in value || "sharedFormula" in value) return cellText(value.result);
    if ("text" in value) return cellText(value.text);
  }
  return "";
}

// Spaces, dashes and brackets are dropped, as are a leading +91 / 91 / 0
// trunk prefix, so "+91 98765-43210" reads as 9876543210. Anything else is
// left for the schema to reject.
export function normaliseMobile(raw) {
  const s = String(raw ?? "").replace(/[\s\-().]/g, "");
  if (/^\+?91\d{10}$/.test(s)) return s.slice(-10);
  if (/^0\d{10}$/.test(s)) return s.slice(1);
  return s;
}

export function normaliseFrequency(raw) {
  const s = norm(raw);
  if (!s) return "";
  for (const [value, names] of Object.entries(FREQUENCY_NAMES)) {
    if (s === value.toLowerCase() || names.includes(s)) return value;
  }
  return String(raw).trim();
}

// ── Masters and jurisdiction ────────────────────────────────────────────────

const namesOf = (row) => [row.name_mr, row.name_en, ...(row.former_names ?? [])].map(norm).filter(Boolean);
const displayName = (row) => row.name_en || row.name_mr;

// Lookup tables over the active masters, built once per import.
export function indexMasters({ divisions = [], districts = [], talukas = [] }) {
  const divisionByName = new Map();
  for (const d of divisions) for (const n of namesOf(d)) if (!divisionByName.has(n)) divisionByName.set(n, d);

  const districtsByName = new Map();
  for (const d of districts) {
    for (const n of namesOf(d)) {
      if (!districtsByName.has(n)) districtsByName.set(n, []);
      districtsByName.get(n).push(d);
    }
  }

  const talukasByDistrict = new Map();
  for (const t of talukas) {
    if (!talukasByDistrict.has(t.district_id)) talukasByDistrict.set(t.district_id, new Map());
    const byName = talukasByDistrict.get(t.district_id);
    for (const n of namesOf(t)) if (!byName.has(n)) byName.set(n, t);
  }

  const divisionById = new Map(divisions.map((d) => [d.id, d]));
  return { divisionByName, districtsByName, talukasByDistrict, divisionById };
}

// Whether a district is inside a scope from lib/scope.js scopeOf().
export function districtInScope(scope, district) {
  if (scope.level === "state") return true;
  if (scope.level === "district") return Number(district.id) === Number(scope.districtId);
  if (scope.level === "division") return Number(district.vibhag_id) === Number(scope.vibhagId);
  return false;
}

// The masters a scope may file records under, for the template's lists.
export function mastersInScope({ divisions, districts, talukas }, scope) {
  const inDistricts = districts.filter((d) => districtInScope(scope, d));
  const districtIds = new Set(inDistricts.map((d) => d.id));
  const divisionIds = new Set(inDistricts.map((d) => d.vibhag_id));
  return {
    divisions: divisions.filter((d) => divisionIds.has(d.id)),
    districts: inDistricts,
    talukas: talukas.filter((t) => districtIds.has(t.district_id)),
  };
}

// ── Reading the sheet ───────────────────────────────────────────────────────

const fileError = (message) => new AppError("VALIDATION_ERROR", message, 422, [{ field: "file", message }]);

// The sum of the sizes a zip's central directory declares for its entries,
// or null when the bytes are not a readable zip. Read before the workbook is
// unpacked, so a small upload cannot inflate to gigabytes in memory.
export function zipUnpackedSize(buf) {
  const floor = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const entries = buf.readUInt16LE(i + 10);
    let at = buf.readUInt32LE(i + 16);
    let total = 0;
    for (let n = 0; n < entries; n++) {
      if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) return null;
      const size = buf.readUInt32LE(at + 24);
      // 0xFFFFFFFF defers to a Zip64 record: far larger than any sheet.
      if (size === 0xffffffff) return Infinity;
      total += size;
      at += 46 + buf.readUInt16LE(at + 28) + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    }
    return total;
  }
  return null;
}

const NOT_XLSX = "This is not an Excel workbook (.xlsx). Open it in Excel and use Save As → Excel Workbook (.xlsx), then upload again.";

/**
 * Reads the data sheet of an uploaded workbook into { sheet, rows }, where
 * each row is { row: <Excel row number>, raw: { <column key>: text } }.
 * Blank rows are skipped. Problems with the file as a whole — not a workbook,
 * a required column missing, too many rows — throw a 422 naming the file.
 */
export async function readSheet(buffer) {
  if (!buffer?.length || buffer.readUInt32LE(0) !== 0x04034b50) throw fileError(NOT_XLSX);
  const unpacked = zipUnpackedSize(buffer);
  if (unpacked == null) throw fileError(NOT_XLSX);
  if (unpacked > MAX_UNPACKED_BYTES) throw fileError("The workbook is too large to import. Keep to one sheet of at most 1,000 rows.");

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw fileError(NOT_XLSX);
  }
  const ws = wb.getWorksheet(SHEET.data)
    ?? wb.worksheets.find((w) => ![SHEET.guide, SHEET.lists].includes(w.name))
    ?? wb.worksheets[0];
  if (!ws) throw fileError("The workbook has no sheets.");

  const columnOf = {};
  const repeated = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = columnKeyFor(cellText(cell.value));
    if (!key) return;
    if (columnOf[key]) repeated.push(COLUMN[key].en);
    else columnOf[key] = col;
  });
  if (repeated.length) throw fileError(`These columns appear more than once: ${repeated.join(", ")}.`);
  const missing = COLUMNS.filter((c) => c.required && !columnOf[c.key]);
  if (missing.length) {
    throw fileError(
      `Required column${missing.length === 1 ? "" : "s"} missing from row 1 of sheet "${ws.name}": ` +
      `${missing.map((c) => c.en).join(", ")}. Download the template and keep its header row.`
    );
  }

  const rows = [];
  let tooMany = false;
  ws.eachRow({ includeEmpty: false }, (excelRow, number) => {
    if (number === 1 || tooMany) return;
    const raw = {};
    let blank = true;
    for (const c of COLUMNS) {
      const text = columnOf[c.key] ? cellText(excelRow.getCell(columnOf[c.key]).value) : "";
      raw[c.key] = text;
      if (text.trim()) blank = false;
    }
    if (blank) return;
    if (rows.length === IMPORT_MAX_ROWS) { tooMany = true; return; }
    rows.push({ row: number, raw });
  });
  if (tooMany) throw fileError(`The sheet has more than ${IMPORT_MAX_ROWS.toLocaleString("en-IN")} rows. Split it into smaller files.`);
  if (!rows.length) throw fileError(`Sheet "${ws.name}" has no data rows under the header.`);
  return { sheet: ws.name, rows };
}

// ── Checking rows ───────────────────────────────────────────────────────────

// Schema paths that are named differently from the sheet's columns.
const FIELD_OF_PATH = { division_id: "division", district_id: "district", taluka_id: "taluka" };

// The key that makes two rows the same school: a district and an
// institution name.
export const duplicateKey = (districtId, institution) => `${districtId}|${norm(institution)}`;

/**
 * Resolves and validates one row. Returns
 *   { row, values, errors, data }
 * `values` is what the preview shows (master names where they were matched),
 * `errors` is [{ field, message }] keyed by column, and `data` — present only
 * when there are no errors — is what the insert takes.
 */
export function checkRow({ row, raw }, index, scope) {
  const errors = [];
  const fail = (field, message) => {
    if (!errors.some((e) => e.field === field)) errors.push({ field, message });
  };

  const divisionText = oneLine(raw.division);
  const districtText = oneLine(raw.district);
  const talukaText = oneLine(raw.taluka);

  // Division, then the district within it, then the taluka within that —
  // the same chain the form's dropdowns enforce.
  const division = divisionText ? index.divisionByName.get(norm(divisionText)) : null;
  if (divisionText && !division) fail("division", `"${divisionText}" is not a division. Use a name from the Lists sheet.`);

  let district = null;
  if (districtText) {
    const candidates = index.districtsByName.get(norm(districtText)) ?? [];
    district = division ? candidates.find((d) => d.vibhag_id === division.id) ?? null : candidates.length === 1 ? candidates[0] : null;
    if (!candidates.length) fail("district", `"${districtText}" is not a district. Use a name from the Lists sheet.`);
    else if (!division && !district) fail("district", `Fill in a valid division so "${districtText}" can be matched.`);
    else if (division && !district) {
      const home = index.divisionById.get(candidates[0].vibhag_id);
      fail("district", `${districtText} is in ${home ? displayName(home) : "another"} division, not ${displayName(division)}.`);
    }
    if (district && !districtInScope(scope, district)) {
      fail("district", `${displayName(district)} is outside your jurisdiction.`);
    }
  }

  let talukaId = "";
  let taluka = talukaText;
  const listed = district ? index.talukasByDistrict.get(district.id) : null;
  if (listed?.size && talukaText) {
    const match = listed.get(norm(talukaText));
    if (match) {
      talukaId = match.id;
      taluka = match.name_mr;
    } else {
      fail("taluka", `"${talukaText}" is not a taluka of ${displayName(district)}. Use a name from the Lists sheet.`);
    }
  }

  const parsed = activitySchema.safeParse({
    division_id: division?.id ?? "",
    district_id: district?.id ?? "",
    taluka_id: talukaId,
    taluka,
    institution_name: oneLine(raw.institution_name),
    incharge_name: oneLine(raw.incharge_name),
    incharge_mobile: normaliseMobile(raw.incharge_mobile),
    participant_count: String(raw.participant_count ?? "").trim(),
    frequency: normaliseFrequency(raw.frequency),
    description: String(raw.description ?? "").trim(),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = String(issue.path[0] ?? "");
      fail(FIELD_OF_PATH[path] ?? path, issue.message);
    }
  }

  const frequency = normaliseFrequency(raw.frequency);
  const values = {
    division: division ? displayName(division) : divisionText,
    district: district ? displayName(district) : districtText,
    taluka,
    institution_name: oneLine(raw.institution_name),
    incharge_name: oneLine(raw.incharge_name),
    incharge_mobile: normaliseMobile(raw.incharge_mobile),
    participant_count: String(raw.participant_count ?? "").trim(),
    frequency: FREQUENCY_EN[frequency] ?? frequency,
    description: String(raw.description ?? "").trim(),
  };

  // Columns in sheet order, so the first error shown is the leftmost.
  const order = COLUMNS.map((c) => c.key);
  errors.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
  return { row, values, errors, data: errors.length ? null : parsed.data };
}

export const checkRows = (rows, index, scope) => rows.map((r) => checkRow(r, index, scope));

// The district ids of the rows that passed, for looking up schools already
// on record.
export const districtIdsOf = (checked) => [...new Set(checked.filter((r) => r.data).map((r) => r.data.district_id))];

/**
 * Marks repeats among the rows that passed: a school listed twice in the
 * sheet, or one already on record (`existing`: Map of duplicateKey → id).
 */
export function markDuplicates(checked, existing = new Map()) {
  const seen = new Map();
  for (const r of checked) {
    if (!r.data) continue;
    const key = duplicateKey(r.data.district_id, r.data.institution_name);
    if (existing.has(key)) {
      r.errors.push({ field: "institution_name", message: `Already recorded in ${r.values.district} (record #${existing.get(key)}).` });
      r.data = null;
    } else if (seen.has(key)) {
      r.errors.push({ field: "institution_name", message: `Same school as row ${seen.get(key)} of this sheet.` });
      r.data = null;
    } else {
      seen.set(key, r.row);
    }
  }
}

export function summarise(checked) {
  const valid = checked.filter((r) => r.data).length;
  return { total: checked.length, valid, invalid: checked.length - valid };
}

// What the preview and the result return: no internal `data`.
export const publicRows = (checked) => checked.map(({ row, values, errors }) => ({ row, values, errors }));

// ── The template ────────────────────────────────────────────────────────────

const BRAND = "FFC56026";
const REQUIRED_FILL = "FFFCE8D8";
const OPTIONAL_FILL = "FFF1F5F9";
const thin = { style: "thin", color: { argb: "FFCFD9E8" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const colLetter = (n) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

const RULES = {
  division: "Choose from the dropdown (names on the Lists sheet). English or Marathi name.",
  district: "Choose from the dropdown. Must belong to the division on the same row.",
  taluka: "Where the Lists sheet names the district's talukas, use one of those; otherwise type the taluka name.",
  institution_name: `Up to ${MAX.institution} characters. Each school can be recorded once per district.`,
  incharge_name: `Up to ${MAX.incharge} characters.`,
  incharge_mobile: "Optional. Exactly 10 digits when given (+91 / 0 prefix and spaces are removed).",
  participant_count: `Whole number from 1 to ${MAX.participants.toLocaleString("en-IN")}.`,
  frequency: "Daily, Weekly or Monthly (दैनिक, साप्ताहिक, मासिक).",
  description: `Optional. Up to ${MAX.description} characters.`,
};

/**
 * The import template for a caller: the data sheet with dropdowns over the
 * masters inside their jurisdiction, the instructions, and the lists.
 * Resolves to an .xlsx Buffer.
 */
export async function buildTemplate({ divisions, districts, talukas }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amrut Varg CMS";
  wb.created = new Date();

  const divisionById = new Map(divisions.map((d) => [d.id, d]));
  const districtById = new Map(districts.map((d) => [d.id, d]));

  // ── Data sheet
  const ws = wb.addWorksheet(SHEET.data, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));
  const header = ws.getRow(1);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = headerText(c);
    cell.font = { bold: true, color: { argb: c.required ? "FF7A2E0B" : "FF44546F" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? REQUIRED_FILL : OPTIONAL_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER;
    cell.note = `${c.required ? "Required" : "Optional"}. ${RULES[c.key]}`;
  });
  header.height = 48;

  const col = (key) => colLetter(COLUMNS.findIndex((c) => c.key === key) + 1);
  const span = (key) => `${col(key)}2:${col(key)}${IMPORT_MAX_ROWS + 1}`;
  // A mobile number kept as text keeps its digits; a number cell would not.
  ws.getColumn(col("incharge_mobile")).numFmt = "@";
  ws.getColumn(col("description")).alignment = { wrapText: true, vertical: "top" };

  // ── Lists sheet (also the dropdowns' source)
  const lists = wb.addWorksheet(SHEET.lists);
  lists.columns = [
    { header: "Division", key: "div", width: 20 }, { header: "विभाग", key: "div_mr", width: 20 }, { header: "", key: "g1", width: 3 },
    { header: "District", key: "dist", width: 20 }, { header: "जिल्हा", key: "dist_mr", width: 20 }, { header: "In division", key: "dist_div", width: 20 },
    { header: "", key: "g2", width: 3 },
    { header: "Taluka", key: "tal", width: 20 }, { header: "तालुका", key: "tal_mr", width: 20 }, { header: "In district", key: "tal_dist", width: 20 },
    { header: "", key: "g3", width: 3 },
    { header: "Frequency", key: "freq", width: 14 }, { header: "वारंवारता", key: "freq_mr", width: 14 },
  ];
  const listRows = Math.max(divisions.length, districts.length, talukas.length, FREQUENCIES.length);
  for (let i = 0; i < listRows; i++) {
    const dv = divisions[i];
    const ds = districts[i];
    const tl = talukas[i];
    const fq = FREQUENCIES[i];
    lists.addRow({
      div: dv ? displayName(dv) : null, div_mr: dv?.name_mr ?? null,
      dist: ds ? displayName(ds) : null, dist_mr: ds?.name_mr ?? null,
      dist_div: ds && divisionById.get(ds.vibhag_id) ? displayName(divisionById.get(ds.vibhag_id)) : null,
      tal: tl ? displayName(tl) : null, tal_mr: tl?.name_mr ?? null,
      tal_dist: tl && districtById.get(tl.district_id) ? displayName(districtById.get(tl.district_id)) : null,
      freq: fq ? FREQUENCY_EN[fq] : null, freq_mr: fq ? FREQUENCY_NAMES[fq][1] : null,
    });
  }
  const listHeader = lists.getRow(1);
  listHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  listHeader.eachCell((cell) => {
    if (cell.value) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  });
  lists.views = [{ state: "frozen", ySplit: 1 }];

  // Dropdowns. A warning rather than a stop, so a Marathi name typed by hand
  // is not refused by Excel; the import checks every name anyway.
  const dropdown = (formula, title) => ({
    type: "list", allowBlank: true, formulae: [formula],
    showErrorMessage: true, errorStyle: "warning", errorTitle: title,
    error: "This value is not in the list. The import will check it against the masters.",
  });
  if (divisions.length) ws.dataValidations.add(span("division"), dropdown(`${SHEET.lists}!$A$2:$A$${divisions.length + 1}`, "Division"));
  if (districts.length) ws.dataValidations.add(span("district"), dropdown(`${SHEET.lists}!$D$2:$D$${districts.length + 1}`, "District"));
  ws.dataValidations.add(span("frequency"), dropdown(`"${FREQUENCIES.map((f) => FREQUENCY_EN[f]).join(",")}"`, "Frequency"));
  ws.dataValidations.add(span("participant_count"), {
    type: "whole", operator: "between", allowBlank: true, formulae: [1, MAX.participants],
    showErrorMessage: true, errorStyle: "stop", errorTitle: "Students / participants",
    error: `Enter a whole number from 1 to ${MAX.participants}.`,
  });
  ws.dataValidations.add(span("incharge_mobile"), {
    type: "textLength", operator: "equal", allowBlank: true, formulae: [10],
    showErrorMessage: true, errorStyle: "warning", errorTitle: "Contact number",
    error: "A mobile number has exactly 10 digits.",
  });

  // ── Instructions sheet
  const guide = wb.addWorksheet(SHEET.guide);
  guide.columns = [{ width: 34 }, { width: 12 }, { width: 70 }, { width: 34 }];
  const exampleDivision = divisions[0];
  const exampleDistrict = districts.find((d) => d.vibhag_id === exampleDivision?.id) ?? districts[0];
  const exampleTaluka = talukas.find((t) => t.district_id === exampleDistrict?.id);
  const example = {
    division: exampleDivision ? displayName(exampleDivision) : "Pune",
    district: exampleDistrict ? displayName(exampleDistrict) : "Pune",
    taluka: exampleTaluka ? displayName(exampleTaluka) : "Haveli",
    institution_name: "Zilla Parishad School, Wagholi",
    incharge_name: "Sunita Patil",
    incharge_mobile: "9876543210",
    participant_count: "42",
    frequency: "Weekly",
    description: "Weekly session on Saturday mornings.",
  };
  const lines = [
    ["अमृत वर्ग कार्य अहवाल — Excel import"],
    [],
    ["1. Fill one row per school on the \"Activities\" sheet, starting at row 2. Do not change row 1."],
    ["2. Columns marked * are required; the others may be left blank."],
    ["3. Division and district must be inside your jurisdiction (see the Lists sheet)."],
    [`4. At most ${IMPORT_MAX_ROWS.toLocaleString("en-IN")} rows per file. Save as Excel Workbook (.xlsx).`],
    ["5. Upload the file in Admin → Amrut Varg Activities → Import Excel, check the preview, then import."],
    [],
    ["Photographs: a spreadsheet cannot carry photos. Imported records are saved HIDDEN with \"Photo pending\"."],
    ["Add 1–3 photographs to each record from the activities list; it can then be shown publicly."],
    [],
    ["Column", "Required", "Rules", "Example"],
    ...COLUMNS.map((c) => [`${c.en}\n${c.mr}`, c.required ? "Required" : "Optional", RULES[c.key], example[c.key]]),
  ];
  lines.forEach((values) => guide.addRow(values));
  guide.getRow(1).font = { bold: true, size: 14, color: { argb: BRAND } };
  guide.getRow(9).font = { bold: true, color: { argb: "FFB45309" } };
  const tableTop = 12;
  const tableHead = guide.getRow(tableTop);
  tableHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  tableHead.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.border = BORDER;
  });
  for (let r = tableTop + 1; r <= tableTop + COLUMNS.length; r++) {
    const row = guide.getRow(r);
    row.alignment = { wrapText: true, vertical: "top" };
    row.eachCell((cell) => { cell.border = BORDER; });
    const required = row.getCell(2);
    required.font = { bold: true, color: { argb: required.value === "Required" ? "FFDC2626" : "FF7B8AA3" } };
  }

  // The data sheet opens first.
  wb.views = [{ activeTab: 0 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
