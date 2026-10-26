// Seed configuration for the official links and social profiles.
//
// Mirrors what the site ships hardcoded in translations.js. One record serves
// both places the same two links appear — the footer's "अधिकृत दुवे" column and
// the "अधिकृत माहिती" tab of the contact desk — so the pair can no longer drift
// apart the way two hardcoded copies did.
//
// The title and description are both stored even though the footer prints only
// the title: the contact desk shows the description underneath it, and keeping
// one record for the pair is the point.

// Legacy platform labels kept for existing footer records and clients.
export const PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "X (Twitter)" },
  { value: "linkedin", label: "LinkedIn" },
];

export const PLATFORM_VALUES = PLATFORMS.map((p) => p.value);

// Admins may name any social network; this list only chooses its icon.
export const SOCIAL_ICONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "X (Twitter)" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "pinterest", label: "Pinterest" },
  { value: "threads", label: "Threads" },
  { value: "discord", label: "Discord" },
  { value: "reddit", label: "Reddit" },
  { value: "link", label: "Generic link" },
];

export const SOCIAL_ICON_VALUES = SOCIAL_ICONS.map((icon) => icon.value);

// Icons the official links may carry, limited to the set the site already draws.
export const LINK_ICONS = ["globe", "building", "external", "file", "users", "award"];

export const DEFAULT_FOOTER = {
  text: {
    official_heading_mr: "अधिकृत दुवे",
    official_heading_en: "Official links",
    social_heading_mr: "आम्हाला फॉलो करा",
    social_heading_en: "Follow us",
  },
  links: [
    {
      id: "link-portal",
      url: "https://amrutvarg.mahaamrut.org.in/",
      icon: "globe",
      title_mr: "अमृत वर्ग पोर्टल",
      title_en: "Amrut Varg Portal",
      desc_mr: "नोंदणी व सध्या सुरु असलेल्या अमृत वर्गांची अद्ययावत यादी.",
      desc_en: "Registration and the up-to-date list of active Amrut Vargs.",
      enabled: true,
    },
    {
      id: "link-amrut",
      url: "https://mahaamrut.org.in/",
      icon: "building",
      title_mr: "अमृत — अधिकृत संकेतस्थळ",
      title_en: "AMRUT — Official Website",
      desc_mr: "महाराष्ट्र संशोधन, उन्नती व प्रशिक्षण प्रबोधिनीचे अधिकृत संकेतस्थळ.",
      desc_en: "Official website of the Academy of Maharashtra Research, Upliftment and Training.",
      enabled: true,
    },
  ],
  // Seeded empty: the organisation's handles are not in the codebase, and an
  // invented address would be worse than no icon. A profile with no URL is not
  // sent to the site, so the row is simply absent until someone fills it in.
  social: [
    { id: "soc-facebook", platform: "facebook", url: "", label_mr: "", label_en: "", enabled: true },
    { id: "soc-instagram", platform: "instagram", url: "", label_mr: "", label_en: "", enabled: true },
    { id: "soc-twitter", platform: "twitter", url: "", label_mr: "", label_en: "", enabled: true },
    { id: "soc-linkedin", platform: "linkedin", url: "", label_mr: "", label_en: "", enabled: true },
  ],
};
