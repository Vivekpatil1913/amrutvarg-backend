import pg from "pg";
import "../src/config/loadEnv.js";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432"),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres123",
  database: process.env.PGDATABASE || "amrutvarg_cms",
});

async function upsertAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@amrutvarg.local";
  const password = process.env.SEED_ADMIN_PASSWORD || "Admin@1234";
  const name = process.env.SEED_ADMIN_NAME || "Admin";
  const hash = await bcrypt.hash(password, 12);

  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, name, password_hash, role)
     VALUES ($1, $2, $3, 'superadmin')
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, name, hash]
  );
  if (rows.length > 0) {
    console.log(`✓ Admin created: ${email} / ${password}`);
  } else {
    console.log(`✓ Admin already exists: ${email}`);
  }
}

async function seedAnnouncements() {
  const { rows: existing } = await pool.query(
    `SELECT COUNT(*) AS count FROM announcements`
  );
  if (parseInt(existing[0].count) > 0) {
    console.log("✓ Announcements already seeded");
    return;
  }

  const announcements = [
    {
      title_mr: "अमृत वर्ग नोंदणी सुरू आहे",
      title_en: "Amrut Varg Registration Open",
      desc_mr: "राज्यभरातील विद्यार्थी आता जवळच्या अमृत वर्गात नोंदणी करू शकतात.",
      desc_en: "Students across Maharashtra can now enroll in their nearest Amrut Varg.",
      status: "new",
      pinned: true,
      is_active: true,
      display_order: 1,
    },
    {
      title_mr: "मार्गदर्शक सूचना व परिपत्रके लवकरच उपलब्ध",
      title_en: "Guidelines & Circulars Coming Soon",
      desc_mr: "अमृत वर्गाच्या संचालनासाठी मार्गदर्शक सूचना लवकरच प्रकाशित होतील.",
      desc_en: "Guidelines for running Amrut Varg will be published soon.",
      status: "comingSoon",
      pinned: false,
      is_active: true,
      display_order: 2,
    },
  ];

  for (const a of announcements) {
    await pool.query(
      `INSERT INTO announcements (title_mr, title_en, desc_mr, desc_en, status, pinned, is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [a.title_mr, a.title_en, a.desc_mr, a.desc_en, a.status, a.pinned, a.is_active, a.display_order]
    );
  }
  console.log(`✓ Seeded ${announcements.length} announcements`);
}

async function seedStories() {
  const { rows: existing } = await pool.query(`SELECT COUNT(*) AS count FROM stories`);
  if (parseInt(existing[0].count) > 0) {
    console.log("✓ Stories already seeded");
    return;
  }

  const stories = [
    {
      slug: "discovering-my-own-voice",
      category: "confidence",
      title_mr: "स्वबोध होताना...",
      title_en: "Discovering My Own Voice",
      short_mr: "अमृत वर्गात मला माझ्यातील आत्मविश्वास सापडला.",
      short_en: "In Amrut Varg, I found the confidence I never knew I had.",
      content: {
        mr: { intro: "माझ्यासाठी बोलणे कठीण होते..." },
        en: { intro: "Speaking up was always hard for me..." },
      },
      featured: true,
      published: true,
      display_order: 1,
    },
    {
      slug: "first-step-into-the-circle",
      category: "personality",
      title_mr: "वर्तुळात पहिले पाऊल",
      title_en: "First Step Into the Circle",
      short_mr: "पहिल्याच दिवशी मला वेगळाच अनुभव आला.",
      short_en: "The very first day changed something in me.",
      content: {
        mr: { intro: "पहिल्याच दिवशी..." },
        en: { intro: "On the very first day..." },
      },
      featured: true,
      published: true,
      display_order: 2,
    },
    {
      slug: "leading-the-surya-namaskar",
      category: "leadership",
      title_mr: "सूर्यनमस्कार अनुभवताना...",
      title_en: "Leading the Surya Namaskar",
      short_mr: "सूर्यनमस्कार करताना येणारा अविस्मरणीय अनुभव",
      short_en: "Leading from the front was an unforgettable experience.",
      content: {
        mr: { intro: "त्या दिवशी माझ्याकडे आघाडी होती..." },
        en: { intro: "That day I was leading the group..." },
      },
      featured: true,
      published: true,
      display_order: 3,
    },
  ];

  for (const s of stories) {
    await pool.query(
      `INSERT INTO stories (slug, category, title_mr, title_en, short_mr, short_en, content, featured, published, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [s.slug, s.category, s.title_mr, s.title_en, s.short_mr, s.short_en,
       JSON.stringify(s.content), s.featured, s.published, s.display_order]
    );
  }
  console.log(`✓ Seeded ${stories.length} stories`);
}

async function seedVargs() {
  const { rows: existing } = await pool.query(`SELECT COUNT(*) AS count FROM vargs`);
  if (parseInt(existing[0].count) > 0) {
    console.log("✓ Vargs already seeded");
    return;
  }

  const vargs = [
    // Konkan
    { vibhag_mr: "कोकण", vibhag_en: "Konkan", district_mr: "रायगड", district_en: "Raigad", taluka: "अलिबाग", school_name: "जिल्हा परिषद शाळा क्र. १, अलिबाग", is_active: true },
    { vibhag_mr: "कोकण", vibhag_en: "Konkan", district_mr: "रत्नागिरी", district_en: "Ratnagiri", taluka: "रत्नागिरी", school_name: "विद्यानगर हायस्कूल, रत्नागिरी", is_active: true },
    { vibhag_mr: "कोकण", vibhag_en: "Konkan", district_mr: "सिंधुदुर्ग", district_en: "Sindhudurg", taluka: "कुडाळ", school_name: "श्री. कुडाळ विद्यालय", is_active: true },
    // Pune
    { vibhag_mr: "पुणे", vibhag_en: "Pune", district_mr: "पुणे", district_en: "Pune", taluka: "पुणे शहर", school_name: "महाराष्ट्र विद्यालय, पुणे", is_active: true },
    { vibhag_mr: "पुणे", vibhag_en: "Pune", district_mr: "पुणे", district_en: "Pune", taluka: "हवेली", school_name: "नवभारत विद्यालय, वडगाव", is_active: true },
    { vibhag_mr: "पुणे", vibhag_en: "Pune", district_mr: "सातारा", district_en: "Satara", taluka: "सातारा", school_name: "प्रतापसिंह हायस्कूल, सातारा", is_active: true },
    { vibhag_mr: "पुणे", vibhag_en: "Pune", district_mr: "सोलापूर", district_en: "Solapur", taluka: "सोलापूर उत्तर", school_name: "ज्ञानज्योती शाळा, सोलापूर", is_active: true },
    { vibhag_mr: "पुणे", vibhag_en: "Pune", district_mr: "कोल्हापूर", district_en: "Kolhapur", taluka: "कोल्हापूर", school_name: "शाहू विद्यालय, कोल्हापूर", is_active: true },
    // Nashik
    { vibhag_mr: "नाशिक", vibhag_en: "Nashik", district_mr: "नाशिक", district_en: "Nashik", taluka: "नाशिक", school_name: "कुसुमाग्रज विद्यालय, नाशिक", is_active: true },
    { vibhag_mr: "नाशिक", vibhag_en: "Nashik", district_mr: "अहमदनगर", district_en: "Ahmednagar", taluka: "अहमदनगर", school_name: "न्यू इंग्लिश स्कूल, अहमदनगर", is_active: true },
    { vibhag_mr: "नाशिक", vibhag_en: "Nashik", district_mr: "धुळे", district_en: "Dhule", taluka: "धुळे", school_name: "जिल्हा विद्यालय, धुळे", is_active: true },
    // Chhatrapati Sambhajinagar
    { vibhag_mr: "छत्रपती संभाजीनगर", vibhag_en: "Chh. Sambhajinagar", district_mr: "छत्रपती संभाजीनगर", district_en: "Chh. Sambhajinagar", taluka: "संभाजीनगर", school_name: "देवगिरी हायस्कूल", is_active: true },
    { vibhag_mr: "छत्रपती संभाजीनगर", vibhag_en: "Chh. Sambhajinagar", district_mr: "बीड", district_en: "Beed", taluka: "बीड", school_name: "आदर्श विद्यालय, बीड", is_active: true },
    { vibhag_mr: "छत्रपती संभाजीनगर", vibhag_en: "Chh. Sambhajinagar", district_mr: "लातूर", district_en: "Latur", taluka: "लातूर", school_name: "स्वामी विवेकानंद विद्यालय", is_active: true },
    { vibhag_mr: "छत्रपती संभाजीनगर", vibhag_en: "Chh. Sambhajinagar", district_mr: "उस्मानाबाद", district_en: "Osmanabad", taluka: "उस्मानाबाद", school_name: "तुळजाभवानी विद्यालय", is_active: true },
    // Amravati
    { vibhag_mr: "अमरावती", vibhag_en: "Amravati", district_mr: "अमरावती", district_en: "Amravati", taluka: "अमरावती", school_name: "विदर्भ भूषण हायस्कूल", is_active: true },
    { vibhag_mr: "अमरावती", vibhag_en: "Amravati", district_mr: "यवतमाळ", district_en: "Yavatmal", taluka: "यवतमाळ", school_name: "वसंतराव नाईक विद्यालय", is_active: true },
    { vibhag_mr: "अमरावती", vibhag_en: "Amravati", district_mr: "वर्धा", district_en: "Wardha", taluka: "वर्धा", school_name: "हिंदुस्थान हायस्कूल, वर्धा", is_active: true },
    { vibhag_mr: "अमरावती", vibhag_en: "Amravati", district_mr: "अकोला", district_en: "Akola", taluka: "अकोला", school_name: "श्री. एकात्म विद्यालय, अकोला", is_active: true },
    // Nagpur
    { vibhag_mr: "नागपूर", vibhag_en: "Nagpur", district_mr: "नागपूर", district_en: "Nagpur", taluka: "नागपूर", school_name: "हिस्लॉप हायस्कूल, नागपूर", is_active: true },
    { vibhag_mr: "नागपूर", vibhag_en: "Nagpur", district_mr: "चंद्रपूर", district_en: "Chandrapur", taluka: "चंद्रपूर", school_name: "ताडोबा विद्यालय, चंद्रपूर", is_active: true },
    { vibhag_mr: "नागपूर", vibhag_en: "Nagpur", district_mr: "भंडारा", district_en: "Bhandara", taluka: "भंडारा", school_name: "संत तुकाराम हायस्कूल", is_active: true },
    { vibhag_mr: "नागपूर", vibhag_en: "Nagpur", district_mr: "गोंदिया", district_en: "Gondia", taluka: "गोंदिया", school_name: "विदर्भ विद्यालय, गोंदिया", is_active: true },
  ];

  let order = 1;
  for (const v of vargs) {
    await pool.query(
      `INSERT INTO vargs (vibhag_mr, vibhag_en, district_mr, district_en, taluka, school_name, varg_name, coordinator_name, enrollment_count, is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [v.vibhag_mr, v.vibhag_en, v.district_mr, v.district_en, v.taluka || "",
       v.school_name, "", "", 0, v.is_active, order++]
    );
  }
  console.log(`✓ Seeded ${vargs.length} vargs`);
}

async function seedSettings() {
  const { rows: existing } = await pool.query(`SELECT COUNT(*) AS count FROM website_settings`);
  if (parseInt(existing[0].count) > 0) {
    console.log("✓ Settings already seeded");
    return;
  }

  const settings = [
    // General
    { key: "site_title_mr", value: "अमृत वर्ग", label: "Site Title (Marathi)", group: "general" },
    { key: "site_title_en", value: "Amrut Varg", label: "Site Title (English)", group: "general" },
    { key: "site_tagline_mr", value: "महाराष्ट्रातील युवा घडविण्याचा कार्यक्रम", label: "Tagline (Marathi)", group: "general" },
    { key: "site_tagline_en", value: "Building Youth of Maharashtra", label: "Tagline (English)", group: "general" },
    // Contact
    { key: "state_coordinator_phone", value: "9112227668", label: "State Coordinator Phone", group: "contact" },
    { key: "contact_email", value: "amrutvarg@mahaamrut.org.in", label: "Contact Email", group: "contact" },
    // Official Links
    { key: "portal_url", value: "https://amrutvarg.mahaamrut.org.in", label: "Amrutvarg Portal URL", group: "links" },
    { key: "mahaamrut_url", value: "https://mahaamrut.org.in", label: "Mahaamrut Website URL", group: "links" },
    { key: "district_officer_form", value: "", label: "District Officer Google Form URL", group: "links" },
    // SEO
    { key: "meta_description", value: "Amrut Varg is a daily programme for teenage students promoting physical activity, personality development, and national values.", label: "Meta Description", group: "seo" },
  ];

  for (const s of settings) {
    await pool.query(
      `INSERT INTO website_settings (setting_key, value, label, group_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (setting_key) DO NOTHING`,
      [s.key, s.value, s.label, s.group]
    );
  }
  console.log(`✓ Seeded ${settings.length} settings`);
}

async function seedContacts() {
  const { rows: existing } = await pool.query(`SELECT COUNT(*) AS count FROM district_contacts`);
  if (parseInt(existing[0].count) > 0) {
    console.log("✓ District contacts already seeded");
    return;
  }

  const contacts = [
    { division_mr: "पुणे", division_en: "Pune", role: "divisionalManager", districts: ["पुणे", "सातारा", "सोलापूर", "कोल्हापूर", "सांगली"], name: "संजय पाटील", email: "pune.div@amrutvarg.org", phone: "9876543210" },
    { division_mr: "नाशिक", division_en: "Nashik", role: "divisionalManager", districts: ["नाशिक", "अहमदनगर", "धुळे", "नंदुरबार", "जळगाव"], name: "राजेंद्र शर्मा", email: "nashik.div@amrutvarg.org", phone: "9876543211" },
    { division_mr: "कोकण", division_en: "Konkan", role: "divisionalManager", districts: ["रायगड", "रत्नागिरी", "सिंधुदुर्ग"], name: "विनायक देसाई", email: "konkan.div@amrutvarg.org", phone: "9876543212" },
    { division_mr: "छत्रपती संभाजीनगर", division_en: "Chh. Sambhajinagar", role: "divisionalManager", districts: ["छत्रपती संभाजीनगर", "बीड", "लातूर", "उस्मानाबाद", "नांदेड", "परभणी", "हिंगोली"], name: "संतोष कुलकर्णी", email: "csn.div@amrutvarg.org", phone: "9876543213" },
    { division_mr: "अमरावती", division_en: "Amravati", role: "divisionalManager", districts: ["अमरावती", "यवतमाळ", "वर्धा", "अकोला", "वाशिम", "बुलढाणा"], name: "महेश गायकवाड", email: "amravati.div@amrutvarg.org", phone: "9876543214" },
    { division_mr: "नागपूर", division_en: "Nagpur", role: "divisionalManager", districts: ["नागपूर", "चंद्रपूर", "भंडारा", "गोंदिया", "गडचिरोली"], name: "अनिल मेश्राम", email: "nagpur.div@amrutvarg.org", phone: "9876543215" },
  ];

  let order = 1;
  for (const c of contacts) {
    await pool.query(
      `INSERT INTO district_contacts (division_mr, division_en, role, districts, name, email, phone, is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [c.division_mr, c.division_en, c.role, c.districts, c.name, c.email, c.phone, true, order++]
    );
  }
  console.log(`✓ Seeded ${contacts.length} district contacts`);
}

async function main() {
  console.log("🌱 Seeding Amrutvarg CMS database...\n");
  try {
    await upsertAdmin();
    await seedSettings();
    await seedAnnouncements();
    await seedStories();
    await seedVargs();
    await seedContacts();
    console.log("\n✅ Seed complete!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
