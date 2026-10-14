// Registry of the website's public forms.
//
// This module manages only the presentation text around each form and whether
// it accepts submissions. Field definitions, validation rules, payload keys and
// submission endpoints stay entirely in the form components and are not
// configurable — changing them is explicitly out of scope.
//
// `fields` and `route` are read-only metadata so the admin list can show what a
// form contains without that list ever becoming a source of truth.

export const FORM_KEYS = ["participant", "organizer", "leader"];

export const FORM_META = {
  participant: {
    key: "participant",
    name: "Student Registration",
    route: "/ — Amrut Vargs section → Enroll",
    component: "src/components/forms/ParticipantForm.jsx",
    endpoint: "POST /api/v1/forms/participants",
    fieldCount: 27,
    hasUpload: false,
  },
  organizer: {
    key: "organizer",
    name: "Organizer Registration",
    route: "/ — Join and Contact sections",
    component: "src/components/forms/OrganizerForm.jsx",
    endpoint: "POST /api/v1/forms/organizers",
    fieldCount: 5,
    hasUpload: false,
  },
  leader: {
    key: "leader",
    name: "Amrut Varg Leader",
    route: "/ — Join section",
    component: "src/components/forms/LeaderForm.jsx",
    endpoint: "POST /api/v1/forms/leaders",
    fieldCount: 16,
    hasUpload: true,
  },
};

// Seeded from the strings the site ships today, so the first publish leaves
// every form reading exactly as it does now.
export const DEFAULT_CONFIGS = {
  participant: {
    title_mr: "विद्यार्थी नोंदणी",
    title_en: "Student Registration",
    intro_mr: "",
    intro_en: "",
    submit_label_mr: "",
    submit_label_en: "",
    success_title_mr: "",
    success_title_en: "",
    success_desc_mr: "",
    success_desc_en: "",
    is_active: true,
    closed_message_mr: "विद्यार्थी नोंदणी सध्या बंद आहे. कृपया नंतर पुन्हा प्रयत्न करा.",
    closed_message_en: "Student registration is currently closed. Please check back later.",
  },
  organizer: {
    title_mr: "आयोजक नोंदणी",
    title_en: "Organizer Registration",
    intro_mr: "",
    intro_en: "",
    submit_label_mr: "",
    submit_label_en: "",
    success_title_mr: "",
    success_title_en: "",
    success_desc_mr: "",
    success_desc_en: "",
    is_active: true,
    closed_message_mr: "आयोजक नोंदणी सध्या बंद आहे. कृपया नंतर पुन्हा प्रयत्न करा.",
    closed_message_en: "Organizer registration is currently closed. Please check back later.",
  },
  leader: {
    title_mr: "अमृत वर्ग प्रमुख नोंदणी",
    title_en: "Amrut Varg Leader Registration",
    intro_mr: "",
    intro_en: "",
    submit_label_mr: "",
    submit_label_en: "",
    success_title_mr: "",
    success_title_en: "",
    success_desc_mr: "",
    success_desc_en: "",
    is_active: true,
    closed_message_mr: "प्रमुख नोंदणी सध्या बंद आहे. कृपया नंतर पुन्हा प्रयत्न करा.",
    closed_message_en: "Leader registration is currently closed. Please check back later.",
  },
};
