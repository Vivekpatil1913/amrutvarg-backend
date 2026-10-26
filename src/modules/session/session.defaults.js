// Seed configuration for the "दैनिक सत्र रचना" (Daily Session Plan) section.
//
// Mirrors what the site ships hardcoded in translations.js. The step number and
// the hour-breakdown bar are both derived — the number from position, the bar
// from the steps that carry minutes — so neither is stored and neither can go
// out of step with the list.

export const DEFAULT_SESSION = {
  text: {
    badge_mr: "वर्गाची रचना",
    badge_en: "Structure",
    title_mr: "दैनिक सत्र रचना (सुमारे १ तास)",
    title_en: "Daily Session Plan (Approximately 1 Hour)",
    lead_mr: "प्रार्थनेने सुरुवात आणि शांती मंत्राने समारोप — प्रत्येक सत्र एका ठरावीक क्रमाने चालते.",
    lead_en: "Opening with a prayer and closing with a peace mantra — every session follows the same considered sequence.",
    hour_label_mr: "एका तासाची विभागणी",
    hour_label_en: "How the hour is divided",
    minutes_mr: "मि.",
    minutes_en: "min",
    eyebrow_dot: true,
  },
  steps: [
    {
      id: "ses-prayer", min: 0,
      title_mr: "प्रार्थना", title_en: "Prayer",
      desc_mr: "प्रार्थनेमुळे सकारात्मक मूल्ये, शिस्त आणि एकतेची भावना विकसित होण्यास मदत होते.",
      desc_en: "Prayers help develop positive values, discipline, and a sense of unity.",
      enabled: true,
    },
    {
      id: "ses-relax", min: 5,
      title_mr: "शरीर शिथिलीकरण", title_en: "Relaxation",
      desc_mr: "हलका व्यायाम आणि सूर्यनमस्कार यांचा समावेश असतो.",
      desc_en: "Light exercises and sun salutations help keep the body healthy and active.",
      enabled: true,
    },
    {
      id: "ses-seated", min: 10,
      title_mr: "बैठे खेळ", title_en: "Seated Games",
      desc_mr: "जागेवर बसून खेळले जाणारे खेळ — लक्ष, स्मरणशक्ती आणि त्वरित प्रतिसाद वाढतो.",
      desc_en: "Games played while seated that sharpen attention, memory and quick responses.",
      enabled: true,
    },
    {
      id: "ses-command", min: 10,
      title_mr: "आज्ञा सराव", title_en: "Command Practice",
      desc_mr: "", desc_en: "",
      enabled: true,
    },
    {
      id: "ses-field", min: 20,
      title_mr: "मैदानी खेळ", title_en: "Field Games",
      desc_mr: "संघभावना, चपळता, रणनीती आणि निर्णयक्षमता विकसित होते.",
      desc_en: "Teamwork, agility, strategy, and decision-making are developed.",
      enabled: true,
    },
    {
      id: "ses-personality", min: 15,
      title_mr: "व्यक्तिमत्त्व विकास", title_en: "Personality Development",
      desc_mr: "गीत, प्रेरणादायी कथा आणि राष्ट्रीय घोषणा.",
      desc_en: "Songs, inspiring stories, and national slogans strengthen values.",
      enabled: true,
    },
    {
      id: "ses-peace", min: 0,
      title_mr: "शांती मंत्र", title_en: "Peace Mantra",
      desc_mr: "सत्राचा समारोप शांत वातावरणात केला जातो.",
      desc_en: "The session closes in a calm, positive atmosphere.",
      enabled: true,
    },
  ],
};
