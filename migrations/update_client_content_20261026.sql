-- ============================================================================
-- Client Content Update Migration (2026-10-26)
-- Run this script in PostgreSQL on AWS RDS / Production Database
-- ============================================================================

BEGIN;

-- 1. HERO SECTION: Tagline, Description and terminology updates
UPDATE hero_section
SET
  draft = jsonb_set(
    jsonb_set(
      draft,
      '{text,tagline_mr}',
      '"भविष्यातील सजग नेतृत्व घडवणारा नाविन्यपूर्ण उपक्रम..."'
    ),
    '{text,desc_mr}',
    '"महाराष्ट्र संशोधन, उन्नती व प्रशिक्षण प्रबोधिनीचा एक अनोखा उपक्रम. सर्व किशोरवयीन विद्यार्थ्यांसाठी उपयुक्त. दररोज सुमारे एक तास विद्यार्थ्यांसाठी उद्बोधक पण तितकाच रंजक वर्ग..हसत-खेळत अनुभवा आणि जाणून घ्या तुमच्यासाठी उपयुक्त अशा काही नवीन गोष्टी!!"'
  ),
  published = jsonb_set(
    jsonb_set(
      published,
      '{text,tagline_mr}',
      '"भविष्यातील सजग नेतृत्व घडवणारा नाविन्यपूर्ण उपक्रम..."'
    ),
    '{text,desc_mr}',
    '"महाराष्ट्र संशोधन, उन्नती व प्रशिक्षण प्रबोधिनीचा एक अनोखा उपक्रम. सर्व किशोरवयीन विद्यार्थ्यांसाठी उपयुक्त. दररोज सुमारे एक तास विद्यार्थ्यांसाठी उद्बोधक पण तितकाच रंजक वर्ग..हसत-खेळत अनुभवा आणि जाणून घ्या तुमच्यासाठी उपयुक्त अशा काही नवीन गोष्टी!!"'
  ),
  updated_at = NOW()
WHERE id = 1;

-- 2. ABOUT SECTION: Subtitle caption, 4 Steps, and Features
UPDATE about_section
SET
  draft = jsonb_set(
    jsonb_set(
      jsonb_set(
        draft,
        '{image,caption_mr}',
        '"भविष्यातील सजग नेतृत्व घडवणारा नाविन्यपूर्ण उपक्रम..."'
      ),
      '{steps}',
      '[
        {
          "id": "step-who",
          "icon": "graduation",
          "question_mr": "कोणासाठी?",
          "question_en": "Who is it for?",
          "title_mr": "किशोरवयीन विद्यार्थ्यांसाठी.",
          "title_en": "For Adolescent Students.",
          "desc_mr": "तारुण्याच्या उंबरठ्यावर असणाऱ्या उत्साही मुलां-मुलींसाठी!",
          "desc_en": "For energetic boys and girls on the threshold of youth!",
          "enabled": true
        },
        {
          "id": "step-how",
          "icon": "clock",
          "question_mr": "कसा चालतो?",
          "question_en": "How does it run?",
          "title_mr": "वर्गरचना",
          "title_en": "Class Structure",
          "desc_mr": "दररोज सुमारे एक तास शरीर आणि मेंदूला ताजेतवाने करणाऱ्या गोष्टी,खेळ,उपक्रम यांनी परिपूर्ण वर्ग",
          "desc_en": "A complete class of about an hour daily with activities, games, and ideas that refresh body and mind",
          "enabled": true
        },
        {
          "id": "step-why",
          "icon": "flag",
          "question_mr": "हा वर्ग कशासाठी?",
          "question_en": "What is this class for?",
          "title_mr": "उद्देश",
          "title_en": "Purpose",
          "desc_mr": "भविष्यातील सजग व संवेदनशील नेतृत्व,राष्ट्रभान आणि कर्तव्यभान असणाऱ्या नवतरुणाईला आकार देण्यासाठी.",
          "desc_en": "To shape the new youth with conscious and sensitive leadership, national awareness, and sense of duty.",
          "enabled": true
        },
        {
          "id": "step-next",
          "icon": "arrowUp",
          "question_mr": "पुढचे पाऊल...",
          "question_en": "The Next Step...",
          "title_mr": "पुढचे पाऊल...",
          "title_en": "The Next Step...",
          "desc_mr": "हेच नवतरुण घडवतील...उद्याचा समरस समाज, माध्यम होतील...समाजातील सकारात्मक परिवर्तनाचे आणि वाहक बनतील...आपल्या समृद्ध संस्कृतीचे!!",
          "desc_en": "These youth will build tomorrow''s harmonious society, become mediums of positive social transformation, and torchbearers of our rich culture!!",
          "enabled": true
        }
      ]'::jsonb
    ),
    '{features,items}',
    '[
      {"id": "feat-1", "label_mr": "परिपूर्ण वर्ग रचना", "label_en": "Comprehensive class structure", "enabled": true},
      {"id": "feat-2", "label_mr": "सर्वांगीण व्यक्तिमत्त्व विकास", "label_en": "Holistic personality development", "enabled": true},
      {"id": "feat-3", "label_mr": "सक्षम-संवेदनशील नेतृत्व", "label_en": "Capable & sensitive leadership", "enabled": true},
      {"id": "feat-4", "label_mr": "सहभागातून शिक्षण", "label_en": "Participation-based education", "enabled": true}
    ]'::jsonb
  ),
  published = jsonb_set(
    jsonb_set(
      jsonb_set(
        published,
        '{image,caption_mr}',
        '"भविष्यातील सजग नेतृत्व घडवणारा नाविन्यपूर्ण उपक्रम..."'
      ),
      '{steps}',
      '[
        {
          "id": "step-who",
          "icon": "graduation",
          "question_mr": "कोणासाठी?",
          "question_en": "Who is it for?",
          "title_mr": "किशोरवयीन विद्यार्थ्यांसाठी.",
          "title_en": "For Adolescent Students.",
          "desc_mr": "तारुण्याच्या उंबरठ्यावर असणाऱ्या उत्साही मुलां-मुलींसाठी!",
          "desc_en": "For energetic boys and girls on the threshold of youth!",
          "enabled": true
        },
        {
          "id": "step-how",
          "icon": "clock",
          "question_mr": "कसा चालतो?",
          "question_en": "How does it run?",
          "title_mr": "वर्गरचना",
          "title_en": "Class Structure",
          "desc_mr": "दररोज सुमारे एक तास शरीर आणि मेंदूला ताजेतवाने करणाऱ्या गोष्टी,खेळ,उपक्रम यांनी परिपूर्ण वर्ग",
          "desc_en": "A complete class of about an hour daily with activities, games, and ideas that refresh body and mind",
          "enabled": true
        },
        {
          "id": "step-why",
          "icon": "flag",
          "question_mr": "हा वर्ग कशासाठी?",
          "question_en": "What is this class for?",
          "title_mr": "उद्देश",
          "title_en": "Purpose",
          "desc_mr": "भविष्यातील सजग व संवेदनशील नेतृत्व,राष्ट्रभान आणि कर्तव्यभान असणाऱ्या नवतरुणाईला आकार देण्यासाठी.",
          "desc_en": "To shape the new youth with conscious and sensitive leadership, national awareness, and sense of duty.",
          "enabled": true
        },
        {
          "id": "step-next",
          "icon": "arrowUp",
          "question_mr": "पुढचे पाऊल...",
          "question_en": "The Next Step...",
          "title_mr": "पुढचे पाऊल...",
          "title_en": "The Next Step...",
          "desc_mr": "हेच नवतरुण घडवतील...उद्याचा समरस समाज, माध्यम होतील...समाजातील सकारात्मक परिवर्तनाचे आणि वाहक बनतील...आपल्या समृद्ध संस्कृतीचे!!",
          "desc_en": "These youth will build tomorrow''s harmonious society, become mediums of positive social transformation, and torchbearers of our rich culture!!",
          "enabled": true
        }
      ]'::jsonb
    ),
    '{features,items}',
    '[
      {"id": "feat-1", "label_mr": "परिपूर्ण वर्ग रचना", "label_en": "Comprehensive class structure", "enabled": true},
      {"id": "feat-2", "label_mr": "सर्वांगीण व्यक्तिमत्त्व विकास", "label_en": "Holistic personality development", "enabled": true},
      {"id": "feat-3", "label_mr": "सक्षम-संवेदनशील नेतृत्व", "label_en": "Capable & sensitive leadership", "enabled": true},
      {"id": "feat-4", "label_mr": "सहभागातून शिक्षण", "label_en": "Participation-based education", "enabled": true}
    ]'::jsonb
  ),
  updated_at = NOW()
WHERE id = 1;

-- 3. ACTIVITIES SECTION: "अनोखे उपक्रम"
UPDATE activities_section
SET
  draft = jsonb_set(
    jsonb_set(
      draft,
      '{text,title_mr}',
      '"अनोखे उपक्रम"'
    ),
    '{text,lead_mr}',
    '"शरीर, मन आणि बुद्धी - यांना ताजेतवाने करणारे उपक्रम"'
  ),
  published = jsonb_set(
    jsonb_set(
      published,
      '{text,title_mr}',
      '"अनोखे उपक्रम"'
    ),
    '{text,lead_mr}',
    '"शरीर, मन आणि बुद्धी - यांना ताजेतवाने करणारे उपक्रम"'
  ),
  updated_at = NOW()
WHERE id = 1;

-- 4. SESSION SECTION: "आज्ञा सराव"
UPDATE session_section
SET
  draft = jsonb_set(
    draft,
    '{steps,3,title_mr}',
    '"आज्ञा सराव"'
  ),
  published = jsonb_set(
    published,
    '{steps,3,title_mr}',
    '"आज्ञा सराव"'
  ),
  updated_at = NOW()
WHERE id = 1;

-- 5. VARGS SECTION: "कार्यरत" -> "सध्या सुरु असलेले अमृत वर्ग"
UPDATE vargs_section
SET
  draft = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          draft,
          '{text,title_mr}',
          '"सध्या सुरु असलेले अमृत वर्ग"'
        ),
        '{text,lead_mr}',
        '"सध्या {count} सुरु असलेले अमृत वर्ग उपलब्ध आहेत. सहभागी होण्यासाठी आपल्या जवळचा वर्ग शोधा आणि \"नोंदणी करा\" बटणावर क्लिक करा."'
      ),
      '{text,empty_mr}',
      '"सध्या सुरु असलेले कोणतेही अमृत वर्ग उपलब्ध नाहीत."'
    ),
    '{stats,items,0,label_mr}',
    '"सध्या सुरु असलेले अमृत वर्ग"'
  ),
  published = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          published,
          '{text,title_mr}',
          '"सध्या सुरु असलेले अमृत वर्ग"'
        ),
        '{text,lead_mr}',
        '"सध्या {count} सुरु असलेले अमृत वर्ग उपलब्ध आहेत. सहभागी होण्यासाठी आपल्या जवळचा वर्ग शोधा आणि \"नोंदणी करा\" बटणावर क्लिक करा."'
      ),
      '{text,empty_mr}',
      '"सध्या सुरु असलेले कोणतेही अमृत वर्ग उपलब्ध नाहीत."'
    ),
    '{stats,items,0,label_mr}',
    '"सध्या सुरु असलेले अमृत वर्ग"'
  ),
  updated_at = NOW()
WHERE id = 1;

-- 6. YASHOGATHA SECTION: "प्रत्यक्ष अनुभव" disclaimer
UPDATE yashogatha_section
SET
  draft = jsonb_set(
    jsonb_set(
      draft,
      '{labels,sample_tag_mr}',
      '"प्रत्यक्ष अनुभव"'
    ),
    '{detail_note,text_mr}',
    '"अमृत वर्गातील विद्यार्थ्यांचे प्रत्यक्ष अनुभव."'
  ),
  published = jsonb_set(
    jsonb_set(
      published,
      '{labels,sample_tag_mr}',
      '"प्रत्यक्ष अनुभव"'
    ),
    '{detail_note,text_mr}',
    '"अमृत वर्गातील विद्यार्थ्यांचे प्रत्यक्ष अनुभव."'
  ),
  updated_at = NOW()
WHERE id = 1;

-- 7. STORIES (Yashogatha records)
-- Story 1: स्वबोध होताना...
UPDATE stories
SET
  title_mr = 'स्वबोध होताना...',
  content = jsonb_set(
    jsonb_set(
      jsonb_set(
        content,
        '{mr,title}',
        '"स्वबोध होताना..."'
      ),
      '{mr,lessons}',
      '"गटातील प्रत्येक आवाजाची दखल घेतली पाहिजे.\n\nव्यक्त होण्यासाठी टाकलेले प्रत्येक छोटे पाऊल आत्मविश्वास निर्माण करतात.\n\nनम्रपणे दिलेला नकार म्हणजे उद्धटपणा नव्हे, तो एकप्रकारे आदर व्यक्त करणे होय!\n\nसुरक्षित आणि आपुलकीच्या वातावरणामुळे अबोल मुलेही व्यक्त होऊ लागतात."'
    ),
    '{mr,conclusion}',
    '""'
  ),
  updated_at = NOW()
WHERE slug = 'discovering-my-own-voice';

-- Story 2: मंडलाच्या दिशेने पहिले पाऊल (Lessons update)
UPDATE stories
SET
  content = jsonb_set(
    content,
    '{mr,lessons}',
    '"प्रत्येक अनोख्या प्रवासाची सुरुवात एका छोट्याशा पावलाने होते.\n\nआपुलकीने केलेले साधे स्वागतही अनोळखी व्यक्तीला आपलेसे बनवते.\n\nएकत्र येऊन केलेल्या कृतींनी संवाद होतो आणि भावनिक जवळीक निर्माण होते.\n\nस्वानुभवाने अडचणींची कल्पना येते, त्यामुळे इतरांशी सामंजस्याने वागण्याची समज येते."'
  ),
  updated_at = NOW()
WHERE slug = 'first-step-into-the-circle';

-- Story 3: सूर्यनमस्कार अनुभवताना...
UPDATE stories
SET
  title_mr = 'सूर्यनमस्कार अनुभवताना...',
  short_mr = 'सूर्यनमस्कार करताना येणारा अविस्मरणीय अनुभव',
  content = jsonb_set(
    jsonb_set(
      jsonb_set(
        content,
        '{mr,title}',
        '"सूर्यनमस्कार अनुभवताना..."'
      ),
      '{mr,short}',
      '"सूर्यनमस्कार करताना येणारा अविस्मरणीय अनुभव"'
    ),
    '{mr,lessons}',
    '"पूर्वतयारीमुळे भीती आणि अस्वस्थता संपते आणि निर्माण होतो आत्मविश्वास!\n\nप्रयत्न करताना होणाऱ्या चुका म्हणजे शिकण्याची पहिली पायरीच ना!\n\nनेतृत्त्व करणे म्हणजे सातत्याने दिशादर्शक होऊन इतरांना ध्येयापर्यंत यशस्वीपणे घेऊन जाणे.\n\nभीती वाटते पण तरीही न थकता व घाबरता योग्य कृती करत राहणे, म्हणजे धैर्य!"'
  ),
  updated_at = NOW()
WHERE slug = 'leading-the-surya-namaskar';

COMMIT;

