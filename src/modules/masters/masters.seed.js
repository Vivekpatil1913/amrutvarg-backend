import { query, queryOne } from "../../db/pool.js";

// Seeds the geographical hierarchy once, on first access.
//
// Names are the current official ones; `former_names` carries every retired or
// variant spelling found in this project, so the 23 existing vargs and 6
// district contacts keep resolving without a single row of their data being
// rewritten:
//   अहिल्यानगर  <- अहमदनगर          (renamed 2023)
//   धाराशिव     <- उस्मानाबाद        (renamed 2023)
//   छत्रपती संभाजीनगर <- औरंगाबाद, संभाजीनगर
//   कोकण        <- कोंकण            (the spelling the public site's static map used)

const STATE = { name_mr: "महाराष्ट्र", name_en: "Maharashtra", code: "MH" };

// vibhag -> districts, from the site's own division map.
const HIERARCHY = [
  {
    name_mr: "कोकण", name_en: "Konkan", code: "KON", former: ["कोंकण"],
    districts: [
      ["मुंबई शहर", "Mumbai City", ["मुंबई"]],
      ["मुंबई उपनगर", "Mumbai Suburban", []],
      ["ठाणे", "Thane", []],
      ["पालघर", "Palghar", []],
      ["रायगड", "Raigad", []],
      ["रत्नागिरी", "Ratnagiri", []],
      ["सिंधुदुर्ग", "Sindhudurg", []],
    ],
  },
  {
    name_mr: "पुणे", name_en: "Pune", code: "PUN", former: [],
    districts: [
      ["पुणे", "Pune", []],
      ["सातारा", "Satara", []],
      ["सांगली", "Sangli", []],
      ["सोलापूर", "Solapur", []],
      ["कोल्हापूर", "Kolhapur", []],
    ],
  },
  {
    name_mr: "नाशिक", name_en: "Nashik", code: "NAS", former: [],
    districts: [
      ["नाशिक", "Nashik", []],
      ["धुळे", "Dhule", []],
      ["नंदुरबार", "Nandurbar", []],
      ["जळगाव", "Jalgaon", []],
      ["अहिल्यानगर", "Ahilyanagar", ["अहमदनगर"]],
    ],
  },
  {
    name_mr: "छत्रपती संभाजीनगर", name_en: "Chhatrapati Sambhajinagar", code: "CSN", former: ["औरंगाबाद"],
    districts: [
      ["छत्रपती संभाजीनगर", "Chhatrapati Sambhajinagar", ["औरंगाबाद", "संभाजीनगर"]],
      ["जालना", "Jalna", []],
      ["बीड", "Beed", []],
      ["धाराशिव", "Dharashiv", ["उस्मानाबाद"]],
      ["लातूर", "Latur", []],
      ["नांदेड", "Nanded", []],
      ["हिंगोली", "Hingoli", []],
      ["परभणी", "Parbhani", []],
    ],
  },
  {
    name_mr: "अमरावती", name_en: "Amravati", code: "AMR", former: [],
    districts: [
      ["अमरावती", "Amravati", []],
      ["अकोला", "Akola", []],
      ["वाशिम", "Washim", []],
      ["बुलढाणा", "Buldhana", []],
      ["यवतमाळ", "Yavatmal", []],
    ],
  },
  {
    name_mr: "नागपूर", name_en: "Nagpur", code: "NAG", former: [],
    districts: [
      ["नागपूर", "Nagpur", []],
      ["वर्धा", "Wardha", []],
      ["भंडारा", "Bhandara", []],
      ["गोंदिया", "Gondia", []],
      ["चंद्रपूर", "Chandrapur", []],
      ["गडचिरोली", "Gadchiroli", []],
    ],
  },
];

// Maharashtra has no published canonical taluka list in this project, so rather
// than inventing ~350 names the talukas already present on varg records are
// adopted. Anything else is added by an administrator.
async function seedTalukasFromVargs() {
  const rows = await query(
    `SELECT DISTINCT district_mr, taluka FROM vargs
     WHERE deleted_at IS NULL AND taluka <> '' ORDER BY district_mr, taluka`
  );
  let added = 0;

  for (const { district_mr, taluka } of rows) {
    const district = await queryOne(
      `SELECT id FROM districts
       WHERE (LOWER(name_mr) = LOWER($1) OR $1 = ANY(former_names)) AND deleted_at IS NULL`,
      [district_mr]
    );
    if (!district) continue;

    const [inserted] = await query(
      `INSERT INTO talukas (district_id, name_mr, display_order)
       SELECT $1, $2, 0
       WHERE NOT EXISTS (
         SELECT 1 FROM talukas WHERE district_id = $1 AND LOWER(name_mr) = LOWER($2) AND deleted_at IS NULL
       )
       RETURNING id`,
      [district.id, taluka]
    );
    if (inserted) added += 1;
  }
  return added;
}

// Idempotent: safe to call on every boot, inserts only what is missing.
export async function ensureMasters() {
  const [{ count }] = await query(`SELECT COUNT(*) AS count FROM states WHERE deleted_at IS NULL`);
  if (parseInt(count) > 0) return { seeded: false };

  const [state] = await query(
    `INSERT INTO states (name_mr, name_en, code, display_order) VALUES ($1, $2, $3, 1) RETURNING id`,
    [STATE.name_mr, STATE.name_en, STATE.code]
  );

  let vibhagOrder = 1;
  for (const v of HIERARCHY) {
    const [vibhag] = await query(
      `INSERT INTO vibhags (state_id, name_mr, name_en, code, former_names, display_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [state.id, v.name_mr, v.name_en, v.code, v.former, vibhagOrder++]
    );

    let districtOrder = 1;
    for (const [nameMr, nameEn, former] of v.districts) {
      await query(
        `INSERT INTO districts (vibhag_id, name_mr, name_en, former_names, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [vibhag.id, nameMr, nameEn, former, districtOrder++]
      );
    }
  }

  const talukas = await seedTalukasFromVargs();
  console.log(`[masters] seeded 1 state, ${HIERARCHY.length} vibhags, 36 districts, ${talukas} talukas`);
  return { seeded: true, talukas };
}
