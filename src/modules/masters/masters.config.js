// The four geographical masters share an identical shape, so one definition
// drives all of them rather than four near-copies of the same CRUD router.
//
//   state -> vibhag -> district -> taluka
//
// `child` is the next level down and `usedBy` names the places that reference a
// master by TEXT rather than by id (vargs and district_contacts predate these
// tables). Both are checked before a row may be deleted, so a master that
// something still points at cannot vanish.

export const MASTERS = {
  states: {
    key: "states",
    table: "states",
    label: "State",
    plural: "States",
    parentKey: null,
    parentColumn: null,
    parentTable: null,
    codeRequired: true,
    child: "vibhags",
    usedBy: [],
  },
  vibhags: {
    key: "vibhags",
    table: "vibhags",
    label: "Vibhag",
    plural: "Vibhags",
    parentKey: "states",
    parentColumn: "state_id",
    parentTable: "states",
    codeRequired: false,
    child: "districts",
    usedBy: [
      { table: "vargs", column: "vibhag_mr", label: "Amrut Vargs" },
      { table: "district_contacts", column: "division_mr", label: "district contacts" },
    ],
  },
  districts: {
    key: "districts",
    table: "districts",
    label: "District",
    plural: "Districts",
    parentKey: "vibhags",
    parentColumn: "vibhag_id",
    parentTable: "vibhags",
    codeRequired: false,
    child: "talukas",
    usedBy: [{ table: "vargs", column: "district_mr", label: "Amrut Vargs" }],
  },
  talukas: {
    key: "talukas",
    table: "talukas",
    label: "Taluka",
    plural: "Talukas",
    parentKey: "districts",
    parentColumn: "district_id",
    parentTable: "districts",
    codeRequired: false,
    child: null,
    usedBy: [{ table: "vargs", column: "taluka", label: "Amrut Vargs" }],
  },
};

export const MASTER_KEYS = Object.keys(MASTERS);
