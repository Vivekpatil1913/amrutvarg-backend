// Seed configuration for the "प्रमुख उपक्रम" (Key Activities) section.
//
// Mirrors what the site ships hardcoded in translations.js, so the first publish
// changes nothing a visitor can see. The card number comes from position, so it
// is never stored.

export const DEFAULT_ACTIVITIES = {
  text: {
    badge_mr: "उपक्रम",
    badge_en: "Activities",
    title_mr: "अनोखे उपक्रम",
    title_en: "Unique Activities",
    lead_mr: "शरीर, मन आणि बुद्धी - यांना ताजेतवाने करणारे उपक्रम",
    lead_en: "Activities that refresh body, mind and intellect",
    gains_label_mr: "यातून विकसित होते",
    gains_label_en: "What it builds",
    eyebrow_dot: true,
  },
  cta: {
    label_mr: "संपूर्ण दैनिक सत्र पहा",
    label_en: "See the full daily session",
    target: "#session",
    enabled: true,
  },
  items: [
    {
      id: "act-yoga",
      icon: "sun",
      title_mr: "योग, प्राणायाम, सूर्यनमस्कार व शारीरिक व्यायाम",
      title_en: "Yoga, Pranayama, Surya Namaskar & Physical Exercises",
      gains_mr: ["निरोगी शरीर", "सक्रियता"],
      gains_en: ["Good health", "Staying active"],
      enabled: true,
    },
    {
      id: "act-shlok",
      icon: "scroll",
      title_mr: "प्रार्थना",
      title_en: "Prayers",
      gains_mr: ["सकारात्मक मूल्ये", "शिस्त", "एकता"],
      gains_en: ["Positive values", "Discipline", "Unity"],
      enabled: true,
    },
    {
      id: "act-indoor",
      icon: "bulb",
      title_mr: "बौद्धिक उपक्रम व बैठे खेळ",
      title_en: "Intellectual Activities & Indoor Games",
      gains_mr: ["एकाग्रता", "समस्या सोडवण्याची क्षमता"],
      gains_en: ["Concentration", "Problem-solving"],
      enabled: true,
    },
    {
      id: "act-outdoor",
      icon: "ball",
      title_mr: "मैदानी खेळ",
      title_en: "Outdoor Games",
      gains_mr: ["संघभावना", "चपळता", "निर्णयक्षमता", "खिलाडूवृत्ती"],
      gains_en: ["Teamwork", "Agility", "Decision-making", "Sportsmanship"],
      enabled: true,
    },
    {
      id: "act-songs",
      icon: "music",
      title_mr: "समूहगीत व संगीत",
      title_en: "Group Songs & Music",
      gains_mr: ["एकजूट", "आनंदी सहभाग"],
      gains_en: ["Unity", "Joyful participation"],
      enabled: true,
    },
    {
      id: "act-stories",
      icon: "sparkle",
      title_mr: "प्रेरणादायी कथा व व्यक्तिमत्त्व विकास",
      title_en: "Inspirational Stories & Personality Development",
      gains_mr: ["आत्मविश्वास", "नेतृत्व", "संवाद कौशल्य", "जबाबदारी"],
      gains_en: ["Self-confidence", "Leadership", "Communication", "Responsibility"],
      enabled: true,
    },
  ],
};
