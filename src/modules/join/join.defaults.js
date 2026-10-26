// Seed configuration for the "अमृत वर्गात सहभागी व्हा" (Join) section.
//
// Mirrors what the site ships hardcoded in translations.js. The card number is
// derived from position rather than stored, so it can never disagree with the
// order shown.
//
// `action` picks which registration flow the button opens. It is an enum rather
// than free text because each value is wired to a real handler on the homepage —
// a typo here would otherwise produce a button that does nothing.

export const ACTIONS = [
  { value: "varg", label: "Scroll to the Amrut Varg list" },
  { value: "organizer", label: "Open the Organizer form" },
  { value: "leader", label: "Open the Amrut Varg Leader form" },
];

export const ACTION_VALUES = ACTIONS.map((a) => a.value);

export const DEFAULT_JOIN = {
  text: {
    badge_mr: "नोंदणी",
    badge_en: "Registration",
    title_mr: "अमृत वर्गात सहभागी व्हा",
    title_en: "Join Amrut Varg",
    lead_mr: "विद्यार्थ्याची सध्या सुरु असलेल्या अमृत वर्गात नोंदणी करा, संस्थेच्या वतीने आयोजक म्हणून नोंदणी करा किंवा अमृत वर्ग प्रमुख म्हणून नोंदणी करा.",
    lead_en: "Register a student in an active Amrut Varg, register as an organizer on behalf of an organization, or register as an Amrut Varg Leader.",
    needs_label_mr: "आवश्यक माहिती",
    needs_label_en: "Details you'll need",
    eyebrow_dot: true,
  },
  cards: [
    {
      id: "join-participant",
      action: "varg",
      icon: "graduation",
      action_icon: "graduation",
      title_mr: "विद्यार्थी नोंदणी",
      title_en: "Student Registration",
      desc_mr: "अमृत वर्ग उपक्रमांमध्ये सहभागी होणाऱ्या विद्यार्थ्यासाठी ही नोंदणी आहे. आपल्या जवळचा सध्या सुरु असलेला अमृत वर्ग निवडा आणि त्या वर्गासाठी विद्यार्थ्याची माहिती भरा.",
      desc_en: "For the student who will take part in Amrut Varg activities. Choose an active Amrut Varg near you and fill in the student's details for that Varg.",
      needs: [
        { id: "need-name", label_mr: "पूर्ण नाव", label_en: "Full Name" },
        { id: "need-mobile", label_mr: "मोबाईल क्रमांक", label_en: "Mobile Number" },
        { id: "need-dob", label_mr: "जन्मतारीख", label_en: "Date of Birth" },
        { id: "need-parent", label_mr: "पालक / संरक्षकाचे नाव", label_en: "Parent / Guardian Name" },
        { id: "need-address", label_mr: "कायमचा पत्ता", label_en: "Permanent Address" },
      ],
      note_mr: "पालक, संरक्षक किंवा अधिकृत आयोजक विद्यार्थ्याच्या वतीने हा अर्ज भरू शकतात; अर्जातील माहिती विद्यार्थ्याचीच भरावी.",
      note_en: "A parent, guardian or authorised organizer may fill in the form on the student's behalf; the details entered must be the student's own.",
      link_note_mr: "",
      link_note_en: "",
      link_label_mr: "",
      link_label_en: "",
      link_url: "",
      action_mr: "विद्यार्थ्याची नोंदणी करा",
      action_en: "Register Student",
      enabled: true,
    },
    {
      id: "join-organizer",
      action: "organizer",
      icon: "flag",
      action_icon: "userPlus",
      title_mr: "आयोजक नोंदणी",
      title_en: "Organizer Registration",
      desc_mr: "विद्यार्थ्यांसाठी अमृत वर्ग उपक्रम आयोजित करू इच्छिणाऱ्या गृहनिर्माण संस्था, शाळा व इतर पात्र संस्थांचे प्रतिनिधी किंवा समन्वयक यांच्यासाठी ही नोंदणी आहे. येथे संस्था / उपक्रमाची नोंदणी होते, वैयक्तिक विद्यार्थ्याची नाही. प्रशासकाच्या मंजुरीनंतर आपले नाव यादीत दिसेल.",
      desc_en: "For representatives or coordinators of Housing Societies, Schools and other eligible organizations who want to organize Amrut Varg activities for students. This registers the organization / activity, not an individual student. Your listing will appear after admin approval.",
      needs: [
        { id: "need-org-name", label_mr: "नाव", label_en: "Name" },
        { id: "need-org-place", label_mr: "ठिकाण", label_en: "Place" },
        { id: "need-org-mobile", label_mr: "मोबाईल", label_en: "Mobile" },
        { id: "need-org-designation", label_mr: "पद", label_en: "Designation" },
        { id: "need-org-district", label_mr: "जिल्हा", label_en: "District" },
      ],
      note_mr: "",
      note_en: "",
      link_note_mr: "",
      link_note_en: "",
      link_label_mr: "",
      link_label_en: "",
      link_url: "",
      action_mr: "आयोजक म्हणून नोंदणी करा",
      action_en: "Register as Organizer",
      enabled: true,
    },
    {
      id: "join-leader",
      action: "leader",
      icon: "award",
      action_icon: "userPlus",
      title_mr: "अमृत वर्ग प्रमुख",
      title_en: "Amrut Varg Leader",
      desc_mr: "अमृत वर्ग उपक्रमातून शिकला आहात? अमृत वर्ग प्रमुख / प्रशिक्षक म्हणून नोंदणी करा, अमृत वर्गाचे उपक्रम घ्या आणि इतर विद्यार्थ्यांना प्रशिक्षण द्या.",
      desc_en: "Learned through the Amrut Varg program? Register as an Amrut Varg Leader / Trainer to conduct Amrut Varg activities and train other students.",
      needs: [],
      note_mr: "",
      note_en: "",
      link_note_mr: "मंजूर झालेल्या अमृत वर्ग प्रमुखांची यादी अधिकृत पोर्टलवर प्रकाशित केली जाते.",
      link_note_en: "The list of approved Amrut Varg Leaders is published on the official portal.",
      link_label_mr: "अधिकृत पोर्टल उघडा",
      link_label_en: "Open the official portal",
      link_url: "https://amrutvarg.mahaamrut.org.in/",
      action_mr: "प्रमुख म्हणून नोंदणी करा",
      action_en: "Register as Leader",
      enabled: true,
    },
  ],
};
