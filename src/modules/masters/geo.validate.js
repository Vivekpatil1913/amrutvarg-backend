import { query, queryOne } from "../../db/pool.js";

// Server-side validation of a geographical combination.
//
// Records store NAMES, not ids — that is the existing contract for vargs and
// district_contacts, and it is not changed here. These helpers resolve a stored
// name to its master row (matching current and former names) so a combination
// can be checked without touching the payload.
//
// Inactive masters still resolve: a record written while a district was active
// must stay editable after it is deactivated, and silently rejecting it would
// lose history. Only unknown names and mismatched relationships are errors.

// Matches on the current name in either language, then on former names.
export async function resolveByName(table, name, parentColumn = null, parentId = null) {
  if (!name || !String(name).trim()) return null;
  const value = String(name).trim();
  const scope = parentColumn && parentId ? `AND ${parentColumn} = $2` : "";
  const params = parentColumn && parentId ? [value, parentId] : [value];

  return queryOne(
    `SELECT * FROM ${table}
     WHERE deleted_at IS NULL ${scope}
       AND (LOWER(name_mr) = LOWER($1) OR LOWER(name_en) = LOWER($1) OR $1 = ANY(former_names))
     ORDER BY is_active DESC
     LIMIT 1`,
    params
  );
}

// Checks a vibhag / district / taluka combination. Each part is optional, so a
// form that carries only some of them is validated on what it has.
//
// Returns [] when valid, or field-level issues in the project's usual shape.
export async function validateGeo({ vibhag, district, taluka } = {}, fields = {}) {
  const f = {
    vibhag: fields.vibhag ?? "vibhag_mr",
    district: fields.district ?? "district_mr",
    taluka: fields.taluka ?? "taluka",
  };
  const issues = [];

  const vibhagRow = vibhag ? await resolveByName("vibhags", vibhag) : null;
  if (vibhag && !vibhagRow) {
    issues.push({ field: f.vibhag, message: `Unknown vibhag "${vibhag}"` });
  }

  const districtRow = district ? await resolveByName("districts", district) : null;
  if (district && !districtRow) {
    issues.push({ field: f.district, message: `Unknown district "${district}"` });
  }

  // A district belongs to exactly one vibhag, so the pair must agree.
  if (vibhagRow && districtRow && districtRow.vibhag_id !== vibhagRow.id) {
    const owner = await queryOne(`SELECT name_mr FROM vibhags WHERE id = $1`, [districtRow.vibhag_id]);
    issues.push({
      field: f.district,
      message: `${districtRow.name_mr} belongs to ${owner?.name_mr ?? "another vibhag"}, not ${vibhagRow.name_mr}`,
    });
  }

  // Talukas are only partially populated, so an unrecognised one is accepted —
  // rejecting it would block districts whose talukas are not in the master yet.
  // A taluka that IS known must belong to the chosen district.
  if (taluka && districtRow) {
    const known = await resolveByName("talukas", taluka);
    if (known && known.district_id !== districtRow.id) {
      const owner = await queryOne(`SELECT name_mr FROM districts WHERE id = $1`, [known.district_id]);
      issues.push({
        field: f.taluka,
        message: `${known.name_mr} belongs to ${owner?.name_mr ?? "another district"}, not ${districtRow.name_mr}`,
      });
    }
  }

  return issues;
}

// One live master row by id. Inactive rows still resolve, for the same reason
// resolveByName accepts them: a record written while a district was active
// must stay editable after it is deactivated.
export async function resolveById(table, id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return queryOne(`SELECT * FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [n]);
}

// Resolves a school's district and taluka, preferring ids over names.
//
// This is the strict path. A name can be retyped, renamed or shared between
// two districts; an id either points at a row whose `district_id` matches the
// chosen district or it does not, and there is no third answer. So when ids
// are supplied they decide BOTH the relationship and the stored names — the
// caller's name fields are overwritten from the resolved rows rather than
// trusted, which is what stops a name and an id drifting apart on one record.
//
// Names remain accepted on their own, because the public registration forms
// and any older client still submit them. That path keeps the historic
// behaviour: an unrecognised taluka is allowed through, since the taluka
// master covers only a fraction of Maharashtra and rejecting the rest would
// block most districts outright.
//
// Returns { issues, district, taluka } — `issues` empty when the combination
// is sound. `district` / `taluka` are the resolved rows, or null.
export async function resolveDistrictTaluka(
  { districtId = null, districtName = "", talukaId = null, talukaName = "" } = {},
  fields = {}
) {
  const f = {
    district: fields.district ?? "district_mr",
    taluka: fields.taluka ?? "taluka",
  };
  const issues = [];

  let district = null;
  if (districtId !== null && districtId !== undefined && districtId !== "") {
    district = await resolveById("districts", districtId);
    if (!district) {
      issues.push({ field: f.district, message: "That district no longer exists" });
      return { issues, district: null, taluka: null };
    }
  } else if (districtName) {
    district = await resolveByName("districts", districtName);
    // A name that resolves to nothing is reported by validateGeo, which the
    // name-only path still runs; not duplicated here.
  }

  let taluka = null;
  if (talukaId !== null && talukaId !== undefined && talukaId !== "") {
    taluka = await resolveById("talukas", talukaId);
    if (!taluka) {
      issues.push({ field: f.taluka, message: "That taluka no longer exists" });
      return { issues, district, taluka: null };
    }
    if (!district) {
      issues.push({ field: f.district, message: "Choose a district before a taluka" });
      return { issues, district, taluka: null };
    }
    // The whole point of carrying ids: this comparison is exact.
    if (taluka.district_id !== district.id) {
      const owner = await queryOne(`SELECT name_mr FROM districts WHERE id = $1`, [taluka.district_id]);
      issues.push({
        field: f.taluka,
        message: `${taluka.name_mr} belongs to ${owner?.name_mr ?? "another district"}, not ${district.name_mr}`,
      });
      return { issues, district, taluka: null };
    }
  } else if (talukaName && district) {
    // Best effort, so a name-only submission still gets its id stored.
    taluka = await resolveByName("talukas", talukaName, "district_id", district.id);
  }

  return { issues, district, taluka };
}

// Every district in a list must exist and, when a vibhag is given, belong to it.
// Used by district_contacts, which holds an array of district names.
export async function validateDistrictList(names, vibhag, field = "districts") {
  if (!Array.isArray(names) || names.length === 0) return [];
  const issues = [];
  const vibhagRow = vibhag ? await resolveByName("vibhags", vibhag) : null;

  for (const name of names) {
    const row = await resolveByName("districts", name);
    if (!row) {
      issues.push({ field, message: `Unknown district "${name}"` });
      continue;
    }
    if (vibhagRow && row.vibhag_id !== vibhagRow.id) {
      issues.push({ field, message: `${row.name_mr} does not belong to ${vibhagRow.name_mr}` });
    }
  }
  return issues;
}

// Canonical English name for a resolved master row, so a form can fill the
// matching *_en column without the editor retyping it.
export async function englishFor(table, name) {
  const row = await resolveByName(table, name);
  return row?.name_en || "";
}

export async function listActive(table, parentColumn = null, parentId = null) {
  const scope = parentColumn && parentId ? `AND ${parentColumn} = $1` : "";
  return query(
    `SELECT id, name_mr, name_en, former_names FROM ${table}
     WHERE is_active = TRUE AND deleted_at IS NULL ${scope}
     ORDER BY display_order ASC, name_mr ASC`,
    parentColumn && parentId ? [parentId] : []
  );
}
