// Allowlists and the seed configuration for the homepage hero section.
//
// DEFAULT_HERO mirrors what the site shipped hardcoded in the frontend's
// translations.js, so the first publish changes nothing a visitor can see.

// Icon names the frontend's <Icon> component actually renders. Anything else
// would render as a blank square, so the admin can only pick from this list.
export const ICONS = [
  "menu", "close", "arrowRight", "arrowDown", "arrowUp", "external", "search",
  "phone", "mapPin", "mail", "check", "checkCircle", "info", "alert",
  "chevronDown", "calendar", "sun", "scroll", "ball", "music", "sparkle",
  "users", "userPlus", "flag", "award", "clock", "graduation", "globe",
  "file", "building", "camera", "lock", "chat", "bulb", "heart", "leaf",
  "arrowLeft", "megaphone",
];

// Destinations that exist today: "#id" scrolls to a homepage section, "/path"
// is a real route. Both were taken from the running app, not invented. A CTA or
// quick link can only point at one of these, so a typo cannot produce a dead
// link on the live homepage.
export const TARGETS = [
  { value: "#hero", label: "Home — Hero" },
  { value: "#about", label: "Home — About" },
  { value: "#activities", label: "Home — Activities" },
  { value: "#session", label: "Home — Daily Session" },
  { value: "#growth", label: "Home — Growth" },
  { value: "#yashogatha", label: "Home — Yashogatha" },
  { value: "#vargs", label: "Home — Amrut Vargs" },
  { value: "#join", label: "Home — Registration" },
  { value: "#contact", label: "Home — Contact" },
  { value: "/yashogatha", label: "Page — Yashogatha Stories" },
  { value: "/district-directory", label: "Page — District Directory" },
];

export const TARGET_VALUES = TARGETS.map((t) => t.value);

// Where a statistic's number comes from. "manual" uses the typed value;
// the others are counted from the vargs table when the public API responds,
// so they can never drift from reality or be faked in the editor.
export const STAT_SOURCES = [
  { value: "manual", label: "Manual value" },
  { value: "vargs_count", label: "Count — active Amrut Vargs" },
  { value: "divisions_count", label: "Count — distinct divisions (vibhag)" },
];

export const STAT_SOURCE_VALUES = STAT_SOURCES.map((s) => s.value);

export const DEFAULT_HERO = {
  text: {
    eyebrow_mr: "महाराष्ट्र शासनाची स्वायत्त संस्था",
    eyebrow_en: "Amrut Varg is an autonomous institution under Maharashtra Government",
    title_mr: "अमृत वर्ग",
    title_en: "Amrut Varg",
    tagline_mr: "भविष्यातील सजग नेतृत्व घडवणारा नाविन्यपूर्ण उपक्रम...",
    tagline_en: "An innovative initiative shaping conscious future leadership...",
    desc_mr: "महाराष्ट्र संशोधन, उन्नती व प्रशिक्षण प्रबोधिनीचा एक अनोखा उपक्रम. सर्व किशोरवयीन विद्यार्थ्यांसाठी उपयुक्त. दररोज सुमारे एक तास विद्यार्थ्यांसाठी उद्बोधक पण तितकाच रंजक वर्ग..हसत-खेळत अनुभवा आणि जाणून घ्या तुमच्यासाठी उपयुक्त अशा काही नवीन गोष्टी!!",
    desc_en: "A unique initiative by the Academy of Maharashtra Research, Upliftment and Training. Useful for all adolescent students. An enlightening yet equally engaging class of about one hour every day for students... Experience with fun and games, and learn some new things useful for you!!",
    eyebrow_dot: true,
  },
  images: {
    main: {
      media_id: null,
      url: "",
      alt_mr: "व्यायाम सत्रात हात उंचावणाऱ्या विद्यार्थिनी",
      alt_en: "Girls raising their arms during an exercise session",
      enabled: true,
    },
    small: {
      media_id: null,
      url: "",
      alt_mr: "हॉलमध्ये मांडी घालून बसलेले विद्यार्थी आणि मार्गदर्शन करणारे शिक्षक",
      alt_en: "Students seated cross-legged in a hall while an instructor guides them",
      enabled: true,
    },
    caption_mr: "योग, प्राणायाम, सूर्यनमस्कार व शारीरिक व्यायाम",
    caption_en: "Yoga, pranayama, surya namaskar and physical exercise",
    caption_icon: "sun",
    caption_enabled: true,
  },
  ctas: [
    {
      id: "cta-primary",
      label_mr: "जवळचा अमृत वर्ग शोधा",
      label_en: "Find an Amrut Varg near you",
      icon: "search",
      target: "#vargs",
      enabled: true,
    },
    {
      id: "cta-secondary",
      label_mr: "उपक्रम जाणून घ्या",
      label_en: "Explore the programme",
      icon: "arrowRight",
      target: "#about",
      enabled: true,
    },
  ],
  stats: [
    {
      id: "stat-class",
      label_mr: "किशोरवयीन मुलांकरिता",
      label_en: "For Adolescent Students",
      value_mr: "किशोरवयीन विद्यार्थ्यांसाठी",
      value_en: "For Students",
      source: "manual",
      enabled: true,
    },
    {
      id: "stat-time",
      label_mr: "सत्राचा कालावधी",
      label_en: "Session length",
      value_mr: "दररोज सुमारे १ तास",
      value_en: "Approximately 1 hour daily",
      source: "manual",
      enabled: true,
    },
    {
      id: "stat-vargs",
      label_mr: "सध्या सुरु असलेले अमृत वर्ग",
      label_en: "Active Amrut Vargs",
      value_mr: "",
      value_en: "",
      source: "vargs_count",
      enabled: true,
    },
    {
      id: "stat-divisions",
      label_mr: "विभाग",
      label_en: "Divisions",
      value_mr: "",
      value_en: "",
      source: "divisions_count",
      enabled: true,
    },
  ],
  quicknav: [
    {
      id: "quick-vargs",
      title_mr: "सध्या सुरु असलेले अमृत वर्ग",
      title_en: "Active Amrut Vargs",
      desc_mr: "जवळचा सुरु असलेला अमृत वर्ग शोधा",
      desc_en: "Find an approved Amrut Varg near you",
      icon: "search",
      target: "#vargs",
      enabled: true,
    },
    {
      id: "quick-session",
      title_mr: "दैनिक सत्र",
      title_en: "Daily Session",
      desc_mr: "सुमारे एका तासाच्या सत्राची रचना",
      desc_en: "How an approximately one-hour session runs",
      icon: "clock",
      target: "#session",
      enabled: true,
    },
    {
      id: "quick-join",
      title_mr: "नोंदणी",
      title_en: "Registration",
      desc_mr: "विद्यार्थी, आयोजक किंवा प्रमुख म्हणून",
      desc_en: "As a student, organiser or leader",
      icon: "userPlus",
      target: "#join",
      enabled: true,
    },
    {
      id: "quick-contact",
      title_mr: "संपर्क",
      title_en: "Contact",
      desc_mr: "राज्य व जिल्हानिहाय संपर्क",
      desc_en: "State and district contacts",
      icon: "phone",
      target: "#contact",
      enabled: true,
    },
  ],
  a11y: {
    quick_label_mr: "झटपट दुवे",
    quick_label_en: "Quick links",
  },
};
