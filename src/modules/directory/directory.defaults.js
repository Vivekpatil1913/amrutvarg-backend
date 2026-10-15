// Seed configuration for the "District Coordinators / Managers" page.
//
// Mirrors what the site ships hardcoded in translations.js. The contact cards
// themselves are not here — they live in the `district_contacts` table and are
// edited under Content > District Contacts. This record is the wording around
// them: the heading, the filter labels, the role badges and the footer note.
//
// Three labels are templates rather than plain strings because the page has to
// interpolate a number or a name into them. The placeholders are fixed:
//   count_one / count_many   {n}
//   showing                  {shown}, {total}
//   division_label           {name}
// A template that loses its placeholder still renders — it just stops showing
// the value — so the schema requires the placeholder to be present.
export const COUNT_TOKENS = ["{n}"];
export const SHOWING_TOKENS = ["{shown}", "{total}"];
export const DIVISION_TOKENS = ["{name}"];

// Role ids are the values stored on a contact record. The order here is the
// order the cards are sorted in, and `featured` marks the role that gets the
// wide card at the top of its division — both were hardcoded on the site.
export const DEFAULT_DIRECTORY = {
  text: {
    badge_mr: "जिल्हा संपर्क",
    badge_en: "District Directory",
    title_mr: "District Coordinators / Managers (जिल्हा व्यवस्थापक / जिल्हा समन्वयक)",
    title_en: "District Coordinators / Managers (जिल्हा व्यवस्थापक / जिल्हा समन्वयक)",
    lead_mr: "अमृत वर्गाची विभागनिहाय टीम — विभागीय व्यवस्थापक, जिल्हा व्यवस्थापक, डेटा एंट्री ऑपरेटर, सखी व मित्र.",
    lead_en: "The Amrut Varg team by division — divisional managers, district managers, data entry operators, Sakhis and Mitras.",
    breadcrumb_mr: "पृष्ठाचा मार्ग",
    breadcrumb_en: "Breadcrumb",
    search_label_mr: "नाव, जिल्हा किंवा पदाने शोधा",
    search_label_en: "Search by name, district or role",
    search_placeholder_mr: "नाव, जिल्हा किंवा पदाने शोधा…",
    search_placeholder_en: "Search by name, district or role…",
    district_label_mr: "जिल्हा निवडा",
    district_label_en: "Choose a district",
    all_districts_mr: "सर्व जिल्हे",
    all_districts_en: "All districts",
    count_one_mr: "{n} संपर्क",
    count_one_en: "{n} contact",
    count_many_mr: "{n} संपर्क",
    count_many_en: "{n} contacts",
    showing_mr: "एकूण {total} पैकी {shown} दाखवत आहे",
    showing_en: "Showing {shown} of {total}",
    pagination_mr: "संपर्क यादीची पृष्ठे",
    pagination_en: "Contact list pages",
    no_results_mr: "तुमच्या शोधाशी जुळणारा संपर्क सापडला नाही.",
    no_results_en: "No contacts match your search.",
    clear_filters_mr: "सर्व संपर्क दाखवा",
    clear_filters_en: "Show all contacts",
    division_label_mr: "{name} विभाग",
    division_label_en: "{name} Division",
    whole_division_mr: "संपूर्ण विभाग",
    whole_division_en: "Whole division",
    call_mr: "कॉल करा",
    call_en: "Call",
    email_mr: "ई-मेल पाठवा",
    email_en: "Email",
    pending_title_mr: "जिल्हानिहाय संपर्क माहिती लवकरच",
    pending_title_en: "District contacts coming soon",
    pending_desc_mr: "सत्यापित व सार्वजनिक प्रदर्शनासाठी मंजूर जिल्हा संपर्क माहिती अद्याप या संकेतस्थळावर जोडलेली नाही. तोपर्यंत अमृतच्या अधिकृत संकेतस्थळावरील जिल्हा समन्वयकांची यादी पाहा.",
    pending_desc_en: "Verified district contact details approved for public display have not yet been added to this website. Until then, please see the district coordinator list on the official AMRUT website.",
    official_mr: "अधिकृत जिल्हा संपर्क यादी",
    official_en: "Official district contact list",
    submit_info_mr: "जिल्हा माहिती सादर करा",
    submit_info_en: "Submit District Information",
    state_note_mr: "अमृत वर्ग सुरू करण्याबाबत सामान्य मार्गदर्शनासाठी:",
    state_note_en: "For general guidance on starting an Amrut Varg:",
    state_role_mr: "अमृत वर्ग राज्य व्यवस्थापक",
    state_role_en: "Amrut Varg State Coordinator",
    eyebrow_dot: true,
  },
  roles: [
    { id: "divisionalManager", label_mr: "विभागीय व्यवस्थापक", label_en: "Divisional Manager", featured: true },
    { id: "districtManager", label_mr: "जिल्हा व्यवस्थापक", label_en: "District Manager", featured: false },
    { id: "dataEntry", label_mr: "डेटा एंट्री ऑपरेटर", label_en: "Data Entry Operator", featured: false },
    { id: "sakhi", label_mr: "सखी", label_en: "Sakhi", featured: false },
    { id: "mitra", label_mr: "मित्र", label_en: "Mitra", featured: false },
    { id: "amrutMitra", label_mr: "अमृत मित्र", label_en: "Amrut Mitra", featured: false },
  ],
  links: {
    // The official AMRUT coordinator list, shown when no contacts are published.
    official_url: "https://mahaamrut.org.in/coordinators-contact",
    // Respondent link of the District Officer Google Form. Empty hides the
    // button entirely, which is how the site ships today.
    submit_form_url: "",
    // Printed in the footer note and dialled by the tel: link beside it.
    state_phone: "9112227668",
  },
};
