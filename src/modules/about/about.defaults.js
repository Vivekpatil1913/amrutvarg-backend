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
    caption_mr: "भविष्यातील सजग नेतृत्व घडवणारा नाविन्यपूर्ण उपक्रम...",
    caption_en: "An innovative initiative shaping conscious future leadership...",
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
      title_mr: "किशोरवयीन विद्यार्थ्यांसाठी.",
      title_en: "For Adolescent Students",
      desc_mr: "तारुण्याच्या उंबरठ्यावर असणाऱ्या उत्साही मुलां-मुलींसाठी!",
      desc_en: "For energetic boys and girls on the threshold of youth!",
      enabled: true,
    },
    {
      id: "step-how",
      icon: "clock",
      question_mr: "कसा चालतो?",
      question_en: "How does it run?",
      title_mr: "वर्गरचना",
      title_en: "Class Structure",
      desc_mr: "दररोज सुमारे एक तास शरीर आणि मेंदूला ताजेतवाने करणाऱ्या गोष्टी,खेळ,उपक्रम यांनी परिपूर्ण वर्ग",
      desc_en: "A complete class of about an hour daily with activities, games, and ideas that refresh body and mind",
      enabled: true,
    },
    {
      id: "step-why",
      icon: "flag",
      question_mr: "हा वर्ग कशासाठी?",
      question_en: "What is this class for?",
      title_mr: "उद्देश",
      title_en: "Purpose",
      desc_mr: "भविष्यातील सजग व संवेदनशील नेतृत्व,राष्ट्रभान आणि कर्तव्यभान असणाऱ्या नवतरुणाईला आकार देण्यासाठी.",
      desc_en: "To shape the new youth with conscious and sensitive leadership, national awareness, and sense of duty.",
      enabled: true,
    },
    {
      id: "step-next",
      icon: "arrowUp",
      question_mr: "पुढचे पाऊल...",
      question_en: "The Next Step...",
      title_mr: "पुढचे पाऊल...",
      title_en: "The Next Step...",
      desc_mr: "हेच नवतरुण घडवतील...उद्याचा समरस समाज, माध्यम होतील...समाजातील सकारात्मक परिवर्तनाचे आणि वाहक बनतील...आपल्या समृद्ध संस्कृतीचे!!",
      desc_en: "These youth will build tomorrow's harmonious society, become mediums of positive social transformation, and torchbearers of our rich culture!!",
      enabled: true,
    },
  ],
  features: {
    title_mr: "वैशिष्ट्ये",
    title_en: "Highlights",
    icon: "sparkle",
    enabled: true,
    items: [
      { id: "feat-1", label_mr: "परिपूर्ण वर्ग रचना", label_en: "Comprehensive class structure", enabled: true },
      { id: "feat-2", label_mr: "सर्वांगीण व्यक्तिमत्त्व विकास", label_en: "Holistic personality development", enabled: true },
      { id: "feat-3", label_mr: "सक्षम-संवेदनशील नेतृत्व", label_en: "Capable & sensitive leadership", enabled: true },
      { id: "feat-4", label_mr: "सहभागातून शिक्षण", label_en: "Participation-based education", enabled: true },

    ],
  },
};
