// Seed configuration for the Yashogatha (success stories) section.
//
// This holds only the wording around the stories — the heading, the lead, the
// button and label text, and the sample-story disclaimer. The stories
// themselves are records in the `stories` table with their own admin module;
// nothing about them is duplicated here.

export const DEFAULT_YASHOGATHA = {
  text: {
    badge_mr: "विद्यार्थ्यांचा प्रवास",
    badge_en: "A student's journey",
    title_mr: "यशोगाथा",
    title_en: "Yashogatha",
    lead_mr: "प्रेरणादायी प्रवास, व्यक्तिमत्त्व विकास आणि सकारात्मक बदलांच्या कथा.",
    lead_en: "Stories of inspiring journeys, personal growth and positive change.",
    eyebrow_dot: true,
  },
  labels: {
    read_more_mr: "पुढे वाचा",
    read_more_en: "Read more",
    view_all_mr: "सर्व यशोगाथा पहा",
    view_all_en: "See all stories",
    sample_tag_mr: "प्रत्यक्ष अनुभव",
    sample_tag_en: "Student Experience",
    no_stories_mr: "सध्या कोणतीही यशोगाथा उपलब्ध नाही.",
    no_stories_en: "No stories are available yet.",
  },
  // Shown above the body on a story page. Empty hides the notice entirely.
  detail_note: {
    text_mr: "अमृत वर्गातील विद्यार्थ्यांचे प्रत्यक्ष अनुभव.",
    text_en: "Actual experiences of students participating in Amrut Varg.",
    enabled: true,
  },
  homepage: {
    // How many featured stories the home page strip shows.
    featured_count: 3,
    view_all_target: "/yashogatha",
    enabled: true,
  },
};
