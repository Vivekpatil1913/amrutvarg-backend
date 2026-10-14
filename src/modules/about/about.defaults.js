// Seed configuration for the "What is Amrut Varg?" section.
//
// Mirrors what the site ships hardcoded in translations.js, so the first publish
// changes nothing a visitor can see.

export const DEFAULT_ABOUT = {
  text: {
    badge_mr: "परिचय",
    badge_en: "Introduction",
    title_mr: "अमृत वर्ग म्हणजे काय?",
    title_en: "What is Amrut Varg?",
    eyebrow_dot: true,
  },
  image: {
    media_id: null,
    url: "",
    alt_mr: "शाळेच्या आवारात जमिनीवर बसून मार्गदर्शन ऐकणारे विद्यार्थी",
    alt_en: "Students seated on the floor of a school courtyard listening to a speaker",
    caption_mr: "भविष्यातील नेतृत्व घडवणारा संस्कारमय उपक्रम",
    caption_en: "A formative initiative shaping future leadership.",
    enabled: true,
  },
  // The programme answered as questions, in reading order. The number shown
  // beside each one is its position, so it is never stored.
  steps: [
    {
      id: "step-who",
      icon: "graduation",
      question_mr: "कोणासाठी?",
      question_en: "Who is it for?",
      title_mr: "किशोरवयीन मुलांकरिता",
      title_en: "For Adolescent Students",
      desc_mr: "किशोरवयीन विद्यार्थ्यांसाठी",
      desc_en: "For Students",
      enabled: true,
    },
    {
      id: "step-how",
      icon: "clock",
      question_mr: "कसा चालतो?",
      question_en: "How does it run?",
      title_mr: "वर्गाची रचना",
      title_en: "Structure",
      desc_mr: "दररोज सुमारे एक तास चालणारा, शिस्तबद्ध उपक्रम. शारीरिक, मानसिक आणि बौद्धिक विकासाचा संतुलित समावेश.",
      desc_en: "A disciplined approximately one-hour daily program with balanced physical, mental, and intellectual development.",
      enabled: true,
    },
    {
      id: "step-why",
      icon: "flag",
      question_mr: "का?",
      question_en: "Why?",
      title_mr: "उद्देश",
      title_en: "Purpose",
      desc_mr: "पुढील पिढीत नेतृत्वगुणांची जडणघडण, राष्ट्रभक्तीची भावना जागृत करणे आणि राष्ट्राबद्दल आत्मीयता व जबाबदारीची जाणीव निर्माण करणे.",
      desc_en: "To build leadership qualities in the next generation, awaken patriotism, and cultivate responsibility toward the nation.",
      enabled: true,
    },
    {
      id: "step-next",
      icon: "arrowUp",
      question_mr: "पुढे काय?",
      question_en: "What next?",
      title_mr: "पुढील संधी",
      title_en: "Future Opportunities",
      desc_mr: "विद्यार्थी स्वतः नेतृत्व करतात, नवीन वर्ग सुरू करतात, समाजात सकारात्मक परिवर्तन घडवतात.",
      desc_en: "Students develop leadership, launch new classes, and create positive community change.",
      enabled: true,
    },
  ],
  features: {
    title_mr: "वैशिष्ट्ये",
    title_en: "Highlights",
    icon: "sparkle",
    enabled: true,
    items: [
      { id: "feat-1", label_mr: "शिस्तबद्ध रचना", label_en: "Structured learning", enabled: true },
      { id: "feat-2", label_mr: "सर्वांगीण विकास", label_en: "Holistic development", enabled: true },
      { id: "feat-3", label_mr: "संस्कार", label_en: "Values", enabled: true },
      { id: "feat-4", label_mr: "नेतृत्व", label_en: "Leadership", enabled: true },
      { id: "feat-5", label_mr: "सहभागातून शिक्षण", label_en: "Participation-based education", enabled: true },
    ],
  },
};
