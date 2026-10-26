// Seed configuration for the "सध्या सुरु असलेले अमृत वर्ग" section.
//
// This is the wording and layout around the listing — heading, statistics
// strip, the division atlas, the search bar and the card labels. The vargs
// themselves are records in the `vargs` table with their own admin screens, and
// the district/division masters supply the geography; none of that is
// duplicated here.
//
// The copy below is the site's existing text, so a fresh database serves a page
// identical to the bundled one.

// Where a statistic's number comes from. Everything but `manual` is counted in
// the database at request time, so a figure can never drift from the data.
export const STAT_SOURCES = [
  { value: "vargs_count", label: "Count — active Amrut Vargs" },
  { value: "districts_count", label: "Count — districts in the master" },
  { value: "divisions_count", label: "Count — vibhags in the master" },
  { value: "listed_districts_count", label: "Count — districts that have a varg" },
  { value: "listed_divisions_count", label: "Count — vibhags that have a varg" },
  { value: "manual", label: "Manual — type the number" },
];
export const STAT_SOURCE_VALUES = STAT_SOURCES.map((s) => s.value);

// Icons the statistics strip can use, by the name the site's Icon component
// knows them under.
export const STAT_ICONS = ["building", "mapPin", "globe", "users", "award", "calendar", "check", "star"];

// Which master decides the order of the division ring and the district chips.
export const ORDER_SOURCES = [
  { value: "master", label: "Master order (display order, then name)" },
  { value: "count", label: "Most vargs first" },
  { value: "listing", label: "Order the vargs are listed in" },
];
export const ORDER_SOURCE_VALUES = ORDER_SOURCES.map((o) => o.value);

export const DEFAULT_VARGS_SECTION = {
  text: {
    badge_mr: "मंजूर वर्ग",
    badge_en: "Approved classes",
    title_mr: "सध्या सुरु असलेले अमृत वर्ग",
    title_en: "Active Amrut Vargs",
    // {count} is replaced with the number of listed vargs.
    lead_mr: 'सध्या {count} सुरु असलेले अमृत वर्ग उपलब्ध आहेत. सहभागी होण्यासाठी आपल्या जवळचा वर्ग शोधा आणि "नोंदणी करा" बटणावर क्लिक करा.',
    lead_en: 'There are currently {count} active Amrut Vargs. To take part, find the Varg near you and click "Enroll Now".',
    empty_mr: "सध्या सुरु असलेले कोणतेही अमृत वर्ग उपलब्ध नाहीत.",
    empty_en: "No active Amrut Vargs are available yet.",
    eyebrow_dot: true,
  },

  stats: {
    enabled: true,
    items: [
      {
        key: "vargs", icon: "building", source: "vargs_count", manual_value: 0,
        label_mr: "सध्या सुरु असलेले अमृत वर्ग", label_en: "Active Amrut Vargs",
      },
      {
        key: "districts", icon: "mapPin", source: "districts_count", manual_value: 0,
        label_mr: "जिल्हे", label_en: "Districts",
      },
      {
        key: "divisions", icon: "globe", source: "divisions_count", manual_value: 0,
        label_mr: "विभाग", label_en: "Divisions",
      },
    ],
  },

  atlas: {
    enabled: true,
    title_mr: "विभागानुसार शोधा",
    title_en: "Browse by division",
    note_mr: "प्रत्येक भागाचा आकार त्या विभागातील वर्गांच्या संख्येनुसार आहे.",
    note_en: "Each arc is sized by the number of Vargs in that division.",
    // The ring's centre when no division is picked.
    all_divisions_mr: "सर्व विभाग",
    all_divisions_en: "All divisions",
    // {count} is the number of districts in the master.
    all_districts_mr: "महाराष्ट्रातील सर्व {count} जिल्हे",
    all_districts_en: "All {count} districts of Maharashtra",
    // {name} is the chosen division.
    districts_in_mr: "{name} विभागातील जिल्हे",
    districts_in_en: "Districts in {name}",
    division_order: "listing",
    district_order: "master",
    show_district_chips: true,
  },

  search: {
    enabled: true,
    placeholder_mr: "शाळा, ठिकाण किंवा जिल्ह्याच्या नावाने शोधा",
    placeholder_en: "Search by school, place or district",
    label_mr: "अमृत वर्ग शोधा",
    label_en: "Search Amrut Vargs",
    viewing_mr: "सध्या पाहत आहात",
    viewing_en: "Now viewing",
    // {count} is the number of matching vargs.
    results_count_mr: "{count} अमृत वर्ग आढळले",
    results_count_en: "{count} Amrut Vargs found",
    no_match_mr: "आपल्या शोधाशी जुळणारा अमृत वर्ग आढळला नाही.",
    no_match_en: "No Amrut Varg matches your search.",
    // {name} is the chosen district.
    none_in_district_mr: "{name} जिल्ह्यात अद्याप कोणताही मंजूर अमृत वर्ग सूचीबद्ध नाही.",
    none_in_district_en: "No approved Amrut Varg is listed in {name} district yet.",
    clear_filters_mr: "शोध व फिल्टर काढा",
    clear_filters_en: "Clear search and filters",
  },

  card: {
    pass_label_mr: "अमृत वर्ग",
    pass_label_en: "Amrut Varg",
    cta_mr: "नोंदणी करा",
    cta_en: "Enroll Now",
    // {name} is the division's name, so "अमरावती" reads "अमरावती विभाग".
    division_suffix_mr: "{name} विभाग",
    division_suffix_en: "{name} Division",
    read_more_mr: "पूर्ण वाचा",
    read_more_en: "Read more",
    read_less_mr: "कमी दाखवा",
    read_less_en: "Show less",
    show_coordinator: false,
  },

  list: {
    page_size: 8,
    show_source_note: true,
  },
};
