-- Amrutvarg CMS Database Schema
-- Run via: migrations/migrate.js

-- ====================================================
-- ADMIN AUTH
-- ====================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'admin',  -- admin | superadmin
  avatar_url  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id     INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);

-- ====================================================
-- ANNOUNCEMENTS
-- ====================================================

CREATE TABLE IF NOT EXISTS announcements (
  id            SERIAL PRIMARY KEY,
  title_mr      TEXT NOT NULL,
  title_en      TEXT NOT NULL DEFAULT '',
  desc_mr       TEXT NOT NULL DEFAULT '',
  desc_en       TEXT NOT NULL DEFAULT '',
  link          TEXT,
  link_label    TEXT,
  date          DATE,
  until_date    DATE,
  status        TEXT NOT NULL DEFAULT 'info',  -- info | new | comingSoon | urgent
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, deleted_at);

-- ====================================================
-- YASHOGATHA STORIES
-- ====================================================

CREATE TABLE IF NOT EXISTS stories (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  category      TEXT NOT NULL DEFAULT 'personality',
  title_mr      TEXT NOT NULL,
  title_en      TEXT NOT NULL DEFAULT '',
  short_mr      TEXT NOT NULL DEFAULT '',
  short_en      TEXT NOT NULL DEFAULT '',
  image_key     TEXT,
  content       JSONB NOT NULL DEFAULT '{}',  -- { mr: {...}, en: {...} }
  featured      BOOLEAN NOT NULL DEFAULT FALSE,
  published     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_published ON stories(published, deleted_at);
CREATE INDEX IF NOT EXISTS idx_stories_featured ON stories(featured, published, deleted_at);

-- ====================================================
-- AMRUT VARGS (Active Classes)
-- ====================================================

CREATE TABLE IF NOT EXISTS vargs (
  id                SERIAL PRIMARY KEY,
  vibhag_mr         TEXT NOT NULL,
  vibhag_en         TEXT NOT NULL DEFAULT '',
  district_mr       TEXT NOT NULL,
  district_en       TEXT NOT NULL DEFAULT '',
  taluka            TEXT NOT NULL DEFAULT '',
  school_name       TEXT NOT NULL,
  varg_name         TEXT NOT NULL DEFAULT '',
  coordinator_name  TEXT NOT NULL DEFAULT '',
  enrollment_count  INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  display_order     INTEGER NOT NULL DEFAULT 0,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vargs_district ON vargs(district_mr);
CREATE INDEX IF NOT EXISTS idx_vargs_active ON vargs(is_active, deleted_at);

-- ====================================================
-- DISTRICT CONTACTS (Regional Team)
-- ====================================================

CREATE TABLE IF NOT EXISTS district_contacts (
  id          SERIAL PRIMARY KEY,
  division_mr TEXT NOT NULL,
  division_en TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL,  -- divisionalManager | districtManager | dataEntry | sakhi | mitra | amrutMitra
  districts   TEXT[] NOT NULL DEFAULT '{}',
  name        TEXT NOT NULL,
  email       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================
-- WEBSITE SETTINGS (key-value)
-- ====================================================

CREATE TABLE IF NOT EXISTS website_settings (
  id          SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL DEFAULT '',
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  group_name  TEXT NOT NULL DEFAULT 'general',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================
-- MEDIA ASSETS
-- ====================================================

CREATE TABLE IF NOT EXISTS media_assets (
  id            SERIAL PRIMARY KEY,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  path          TEXT NOT NULL,
  url           TEXT NOT NULL,
  alt_text      TEXT NOT NULL DEFAULT '',
  uploaded_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================
-- FORM SUBMISSIONS
-- ====================================================

CREATE TABLE IF NOT EXISTS form_submissions (
  id          SERIAL PRIMARY KEY,
  form_type   TEXT NOT NULL,  -- participant | organizer | leader
  data        JSONB NOT NULL DEFAULT '{}',
  files       JSONB NOT NULL DEFAULT '[]',  -- [{field, filename, originalName, path}]
  status      TEXT NOT NULL DEFAULT 'new',  -- new | reviewed | actioned | archived
  notes       TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_type ON form_submissions(form_type, status);

-- ====================================================
-- RATE LIMIT (DB-backed, no Redis needed)
-- ====================================================

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id          SERIAL PRIMARY KEY,
  ip          TEXT NOT NULL,
  bucket      TEXT NOT NULL,
  hit_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit ON rate_limit_hits(ip, bucket, hit_at);

-- ====================================================
-- HOMEPAGE HERO SECTION
-- Single row (id = 1) holding the whole section config.
-- `draft` is the admin working copy; `published` is what the
-- public API serves. Publishing copies draft -> published in one
-- statement, so a failed publish can never leave the live site
-- half-updated.
-- ====================================================

CREATE TABLE IF NOT EXISTS hero_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ====================================================
-- PUBLIC FORM CONFIGURATION
-- Presentation text and availability for each public form.
-- Field definitions, validation rules and submission endpoints are NOT stored
-- here: they stay in the form components and are deliberately not configurable.
-- `draft` is the admin working copy; `published` is what the website reads.
-- ====================================================

CREATE TABLE IF NOT EXISTS form_configs (
  form_key     TEXT PRIMARY KEY,
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Submissions are registrations from real people, so deleting one moves it to
-- a trash tab rather than destroying it. Added separately because the table
-- above is only created when absent, and existing databases already have it.
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_submissions_deleted ON form_submissions(deleted_at);

-- ====================================================
-- GEOGRAPHICAL MASTERS
-- state -> vibhag -> district -> taluka.
-- `former_names` carries retired spellings (Ahmednagar, Osmanabad, कोंकण) so
-- records written before a rename still resolve to the right master row
-- without rewriting any existing data.
-- Uniqueness is case-insensitive and scoped to the parent, and applies only to
-- live rows so a soft-deleted name can be reused.
-- ====================================================

CREATE TABLE IF NOT EXISTS states (
  id            SERIAL PRIMARY KEY,
  name_mr       TEXT NOT NULL,
  name_en       TEXT NOT NULL DEFAULT '',
  code          TEXT NOT NULL,
  former_names  TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_states_name ON states (LOWER(name_mr)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_states_code ON states (UPPER(code)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS vibhags (
  id            SERIAL PRIMARY KEY,
  state_id      INTEGER NOT NULL REFERENCES states(id) ON DELETE RESTRICT,
  name_mr       TEXT NOT NULL,
  name_en       TEXT NOT NULL DEFAULT '',
  code          TEXT NOT NULL DEFAULT '',
  former_names  TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vibhags_name ON vibhags (state_id, LOWER(name_mr)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vibhags_state ON vibhags(state_id, deleted_at);

CREATE TABLE IF NOT EXISTS districts (
  id            SERIAL PRIMARY KEY,
  vibhag_id     INTEGER NOT NULL REFERENCES vibhags(id) ON DELETE RESTRICT,
  name_mr       TEXT NOT NULL,
  name_en       TEXT NOT NULL DEFAULT '',
  code          TEXT NOT NULL DEFAULT '',
  former_names  TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_districts_name ON districts (vibhag_id, LOWER(name_mr)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_districts_vibhag ON districts(vibhag_id, deleted_at);

CREATE TABLE IF NOT EXISTS talukas (
  id            SERIAL PRIMARY KEY,
  district_id   INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  name_mr       TEXT NOT NULL,
  name_en       TEXT NOT NULL DEFAULT '',
  code          TEXT NOT NULL DEFAULT '',
  former_names  TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_talukas_name ON talukas (district_id, LOWER(name_mr)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_talukas_district ON talukas(district_id, deleted_at);

-- ====================================================
-- HOMEPAGE "WHAT IS AMRUT VARG?" SECTION
-- Same single-row draft/published shape as hero_section: publishing copies
-- draft -> published in one statement, so a failed publish can never leave the
-- live page half-updated.
-- ====================================================

CREATE TABLE IF NOT EXISTS about_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ====================================================
-- HOMEPAGE "KEY ACTIVITIES" SECTION
-- Same single-row draft/published shape as hero_section and about_section.
-- ====================================================

CREATE TABLE IF NOT EXISTS activities_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ====================================================
-- HOMEPAGE "DAILY SESSION PLAN" SECTION
-- Same single-row draft/published shape as the other homepage sections.
-- ====================================================

CREATE TABLE IF NOT EXISTS session_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ====================================================
-- HOMEPAGE "JOIN AMRUT VARG" SECTION
-- The three registration routes (student, organiser, leader) with their
-- required-detail chips. Same single-row draft/published shape as the other
-- homepage sections.
-- ====================================================

CREATE TABLE IF NOT EXISTS join_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ====================================================
-- DISTRICT DIRECTORY PAGE WORDING
-- The heading, filter labels, role badges and links around the directory. The
-- contact cards themselves live in district_contacts and are not duplicated
-- here. Same single-row draft/published shape as the homepage sections.
-- ====================================================

CREATE TABLE IF NOT EXISTS directory_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ====================================================
-- FOOTER OFFICIAL LINKS AND SOCIAL PROFILES
-- One record for the two places the same official links appear: the footer
-- column and the contact desk tab. Social profiles live here too, so the
-- whole footer is edited in one screen. Same single-row draft/published
-- shape as the homepage sections.
-- ====================================================

CREATE TABLE IF NOT EXISTS footer_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ====================================================
-- YASHOGATHA SECTION WORDING
-- The heading, labels and disclaimer around the success stories. The stories
-- themselves live in the `stories` table and are not duplicated here.
-- ====================================================

-- Wording and layout for the "सध्या सुरु असलेले अमृत वर्ग" section. The vargs themselves
-- live in `vargs`; the district and vibhag counts are read from the masters.
CREATE TABLE IF NOT EXISTS vargs_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS yashogatha_section (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
  published    JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- A story can carry an uploaded photograph. `image_key` stays for the bundled
-- artwork the seeded stories use; an uploaded image takes precedence.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS image_media_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- A slug must be unique among LIVE stories only. The original table-level
-- UNIQUE kept a soft-deleted story's slug reserved for ever, so a deleted
-- story could never be recreated at the same address.
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stories_slug ON stories (slug) WHERE deleted_at IS NULL;

-- ====================================================
-- VIDEOS AND REELS
-- One row per piece of video content. `content_type` separates a full video
-- from a short vertical reel; `source_type` decides which of the two source
-- columns carries the content.
--
--   source_type = 'upload' -> media_id / media_url point at the stored file
--   source_type = 'url'    -> external_url holds the provider address
--
-- `provider` is derived on save (youtube | vimeo | instagram | file | link) so
-- the public page knows how to render a row without re-parsing every URL.
-- Nothing is embedded straight from external_url: the embed address is rebuilt
-- from the parsed ID at render time (src/lib/mediaUrl.js).
-- ====================================================

CREATE TABLE IF NOT EXISTS videos (
  id            SERIAL PRIMARY KEY,
  title_mr      TEXT NOT NULL,
  title_en      TEXT NOT NULL DEFAULT '',
  desc_mr       TEXT NOT NULL DEFAULT '',
  desc_en       TEXT NOT NULL DEFAULT '',
  content_type  TEXT NOT NULL DEFAULT 'video',   -- video | reel
  source_type   TEXT NOT NULL DEFAULT 'url',     -- upload | url
  media_id      INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  media_url     TEXT NOT NULL DEFAULT '',
  external_url  TEXT NOT NULL DEFAULT '',
  provider      TEXT NOT NULL DEFAULT '',
  thumbnail_id  INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  thumbnail_url TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general',
  duration_seconds INTEGER,
  published     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT videos_content_type_chk CHECK (content_type IN ('video', 'reel')),
  CONSTRAINT videos_source_type_chk  CHECK (source_type IN ('upload', 'url')),
  -- A row must actually carry its content: the public page has nothing to
  -- render otherwise, and the check is cheaper than discovering it live.
  CONSTRAINT videos_source_present_chk CHECK (
    (source_type = 'upload' AND media_url <> '') OR
    (source_type = 'url'    AND external_url <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published, deleted_at);
CREATE INDEX IF NOT EXISTS idx_videos_type ON videos(content_type, published, deleted_at);
CREATE INDEX IF NOT EXISTS idx_videos_order ON videos(display_order, created_at DESC);

-- ====================================================
-- PODCAST EPISODES
-- Same source_type split as videos. `duration_seconds` is filled in by the
-- browser when it can read the file's metadata and typed in otherwise, so it
-- is nullable rather than zero — "unknown" and "no length" are not the same.
-- `publish_date` is editorial (the date shown on the episode); `published` is
-- what decides whether the public API returns it at all.
-- ====================================================

CREATE TABLE IF NOT EXISTS podcasts (
  id            SERIAL PRIMARY KEY,
  title_mr      TEXT NOT NULL,
  title_en      TEXT NOT NULL DEFAULT '',
  desc_mr       TEXT NOT NULL DEFAULT '',
  desc_en       TEXT NOT NULL DEFAULT '',
  source_type   TEXT NOT NULL DEFAULT 'url',     -- upload | url
  media_id      INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  media_url     TEXT NOT NULL DEFAULT '',
  external_url  TEXT NOT NULL DEFAULT '',
  provider      TEXT NOT NULL DEFAULT '',
  cover_id      INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  cover_url     TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general',
  duration_seconds INTEGER,
  publish_date  DATE,
  published     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT podcasts_source_type_chk CHECK (source_type IN ('upload', 'url')),
  CONSTRAINT podcasts_source_present_chk CHECK (
    (source_type = 'upload' AND media_url <> '') OR
    (source_type = 'url'    AND external_url <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_podcasts_published ON podcasts(published, deleted_at);
CREATE INDEX IF NOT EXISTS idx_podcasts_date ON podcasts(publish_date DESC NULLS LAST);

-- ====================================================
-- SCHOOL / VARG RESOURCE LINK
-- An optional introduction video or website for the school a varg is held at.
-- Nullable and added in place: existing rows keep their data and read back as
-- NULL, which the site treats the same as "no link".
-- ====================================================

ALTER TABLE vargs ADD COLUMN IF NOT EXISTS resource_url TEXT;

-- ====================================================
-- SCHOOL LOCATION: STABLE IDS AND VILLAGE
-- A varg record is a school, and it has always stored its geography as NAMES
-- (district_mr, taluka). Those columns stay — the public site, the district
-- contacts and the registration forms all read them, and rewriting that
-- contract would be a far larger change than this needs to be.
--
-- What is added is the ID alongside each name. An id is what makes the
-- district -> taluka relationship checkable with certainty: a name can be
-- retyped, renamed or duplicated, while `talukas.district_id` either matches
-- the chosen district or it does not. The names remain the display value and
-- are derived FROM the ids whenever ids are supplied, so the two can never
-- drift apart.
--
-- Both are nullable: a historic record whose district was typed in before
-- these masters existed keeps working, and a district whose talukas have not
-- been entered yet can still be saved.
-- ====================================================

ALTER TABLE vargs ADD COLUMN IF NOT EXISTS district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE vargs ADD COLUMN IF NOT EXISTS taluka_id   INTEGER REFERENCES talukas(id)   ON DELETE SET NULL;

-- Village name. Free text for now: there is no village master in this
-- database, and inventing one would be worse than leaving the field open.
-- Nullable, so every existing row reads back as "no village" unchanged.
ALTER TABLE vargs ADD COLUMN IF NOT EXISTS village TEXT;

CREATE INDEX IF NOT EXISTS idx_vargs_district_id ON vargs(district_id);
CREATE INDEX IF NOT EXISTS idx_vargs_taluka_id ON vargs(taluka_id);

-- Backfill the ids from the names already stored, matching the current name in
-- either language and any former spelling. Only rows whose id is still NULL
-- are touched, so this is safe to re-run and never overwrites a value an
-- administrator has since set. A name that matches nothing is left NULL rather
-- than guessed at.
UPDATE vargs v
   SET district_id = d.id
  FROM districts d
 WHERE v.district_id IS NULL
   AND d.deleted_at IS NULL
   AND (
     LOWER(d.name_mr) = LOWER(TRIM(v.district_mr))
     OR (d.name_en <> '' AND LOWER(d.name_en) = LOWER(TRIM(v.district_mr)))
     OR TRIM(v.district_mr) = ANY(d.former_names)
   );

-- Scoped to the district just resolved, so a taluka name that exists in two
-- districts cannot be attached to the wrong one.
UPDATE vargs v
   SET taluka_id = t.id
  FROM talukas t
 WHERE v.taluka_id IS NULL
   AND v.district_id IS NOT NULL
   AND t.district_id = v.district_id
   AND t.deleted_at IS NULL
   AND TRIM(COALESCE(v.taluka, '')) <> ''
   AND (
     LOWER(t.name_mr) = LOWER(TRIM(v.taluka))
     OR (t.name_en <> '' AND LOWER(t.name_en) = LOWER(TRIM(v.taluka)))
     OR TRIM(v.taluka) = ANY(t.former_names)
   );

-- ====================================================
-- DISTRICT OFFICES
-- One office per district, keyed to the district master by id rather than by
-- name — the same decision as vargs.district_id, and for the same reason: a
-- name can be renamed or retyped, an id cannot.
--
-- Every detail column is optional and defaults to empty. This table exists so
-- verified office information CAN be recorded; it ships with none, and the
-- public page renders only the fields that have actually been filled in. A
-- blank row is therefore indistinguishable from no row, which is the correct
-- behaviour when nothing has been confirmed.
--
-- The UNIQUE index is what stops the same office details being entered twice
-- against one district.
-- ====================================================

CREATE TABLE IF NOT EXISTS district_offices (
  id              SERIAL PRIMARY KEY,
  district_id     INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  office_name_mr  TEXT NOT NULL DEFAULT '',
  office_name_en  TEXT NOT NULL DEFAULT '',
  collector_name  TEXT NOT NULL DEFAULT '',
  collector_designation TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  hours           TEXT NOT NULL DEFAULT '',
  website_url     TEXT NOT NULL DEFAULT '',
  map_url         TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- One live office per district. Scoped to live rows so a soft-deleted office
-- does not reserve its district for ever.
CREATE UNIQUE INDEX IF NOT EXISTS uq_district_offices_district
  ON district_offices (district_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_district_offices_active
  ON district_offices (is_active, deleted_at);

-- ====================================================
-- VIDEO -> SCHOOL LINK
-- A success story video is usually about one school. Recording which one lets
-- the Yashogatha section name it under the title without the editor retyping
-- it, and keeps the name correct when the school record is corrected.
--
-- Nullable: most videos are about the programme rather than a single school.
-- ON DELETE SET NULL, because removing a varg must not take its video with it.
-- ====================================================

ALTER TABLE videos ADD COLUMN IF NOT EXISTS varg_id INTEGER REFERENCES vargs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_videos_varg ON videos(varg_id);

-- ====================================================
-- ANNOUNCEMENT EVENT DETAILS
-- An AMRUT training or event is announced through the same notice as anything
-- else; what it needs extra is where and when to turn up. Every column is
-- optional, so a plain notice is entirely unchanged — a circular has no venue.
--
-- The existing `date` column doubles as the EVENT date. A second date field
-- would only raise the question of which one the website shows, and the
-- weekday is derived from it at render time rather than stored: a stored day
-- can contradict its own date, a derived one cannot.
--
-- `event_time` is text, not TIME: a session runs "सकाळी १० ते दुपारी ४", which
-- a clock column cannot hold. Venue and location are single-language free
-- text, as vargs.school_name and vargs.taluka already are; the notes are
-- bilingual, as every other prose field on this record is.
-- ====================================================

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS event_time     TEXT NOT NULL DEFAULT '';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS venue          TEXT NOT NULL DEFAULT '';

-- The event location is the district and taluka masters rather than free text,
-- so a notice cannot name a place the programme does not recognise. Names and
-- ids both, exactly as vargs does it: the id is what makes the
-- district -> taluka pairing checkable, the name is what gets displayed.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS district    TEXT NOT NULL DEFAULT '';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS taluka      TEXT NOT NULL DEFAULT '';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS taluka_id   INTEGER REFERENCES talukas(id)   ON DELETE SET NULL;

-- Added minutes earlier in this same change and never populated; the district
-- and taluka columns above replace it.
ALTER TABLE announcements DROP COLUMN IF EXISTS event_location;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS notes_mr       TEXT NOT NULL DEFAULT '';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS notes_en       TEXT NOT NULL DEFAULT '';

-- ====================================================
-- HIERARCHICAL ROLES (RBAC)
-- Three tiers of administrator, each confined to a slice of the state:
--
--   superadmin / admin / state_coordinator -> whole state
--   division_manager                       -> one vibhag (all its districts)
--   district_manager                       -> one district
--
-- The jurisdiction is held as master ids rather than names, for the same
-- reason vargs.district_id is: a name can be renamed, an id cannot. A state
-- role leaves both NULL. `phone` is where SMS alerts are sent.
-- ====================================================

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS vibhag_id   INTEGER REFERENCES vibhags(id)   ON DELETE SET NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone       TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_admin_users_scope ON admin_users(role, vibhag_id, district_id);

-- Master audit trail. Written for the actions that change who can do what or
-- what the public sees; read by state-level administrators only.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);

-- ====================================================
-- DIRECT SELF-SERVICE VARG LISTING
-- An organiser's registration is published the moment it is submitted;
-- moderation happens afterwards. `status` records the moderation outcome and
-- `is_active` stays the single switch the public query reads, so the two are
-- written together:
--
--   PUBLISHED   is_active = TRUE   on the public directory
--   UNPUBLISHED is_active = FALSE  taken down by an administrator
--   FLAGGED     is_active = FALSE  taken down pending a correction
--
-- `source` and `submission_id` say where a row came from, so a self-published
-- listing can be traced back to the registration that created it.
-- ====================================================

ALTER TABLE vargs ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE vargs ADD COLUMN IF NOT EXISTS source        TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE vargs ADD COLUMN IF NOT EXISTS submission_id INTEGER REFERENCES form_submissions(id) ON DELETE SET NULL;
ALTER TABLE vargs ADD COLUMN IF NOT EXISTS flag_reason   TEXT NOT NULL DEFAULT '';
ALTER TABLE vargs ADD COLUMN IF NOT EXISTS moderated_by  INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE vargs ADD COLUMN IF NOT EXISTS moderated_at  TIMESTAMPTZ;
-- Rows that predate the status column and were switched off by hand read as
-- unpublished rather than as live-but-hidden.
UPDATE vargs SET status = 'UNPUBLISHED' WHERE is_active = FALSE AND status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_vargs_status ON vargs(status, is_active, deleted_at);

-- Organizer listings created before the form asked for a Varg Name stored the
-- organisation in school_name and the optional branch in varg_name, so a card
-- (which shows varg_name first) read the branch, or nothing, instead of the
-- name the organiser gave. Point varg_name at that name — but only on rows an
-- administrator has not edited since, i.e. varg_name still holds exactly the
-- submitted branch. Re-running is a no-op.
UPDATE vargs v
   SET varg_name = s.data->>'organisation', updated_at = NOW()
  FROM form_submissions s
 WHERE v.submission_id = s.id
   AND v.source = 'organizer'
   AND s.form_type = 'organizer'
   AND COALESCE(s.data->>'organisation', '') <> ''
   AND v.varg_name = COALESCE(s.data->>'branch', '')
   AND v.varg_name <> s.data->>'organisation';

-- ====================================================
-- AMRUT VARG MELAWA (gathering) ANNOUNCEMENTS
-- Shown in the flashing ticker above the site header. A state-wide melawa has
-- no target; a divisional one names a vibhag; a district one names a district
-- and, derived from it, that district's vibhag, so a division manager's filter
-- is a single column.
--
-- Times are clock times in IST. A melawa stops being "active" once its last
-- day's end time has passed; the background sweep then archives it.
-- ====================================================

CREATE TABLE IF NOT EXISTS melawa_events (
  id                  SERIAL PRIMARY KEY,
  title_mr            TEXT NOT NULL,
  title_en            TEXT NOT NULL DEFAULT '',
  event_date          DATE NOT NULL,
  end_date            DATE,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  venue_mr            TEXT NOT NULL,
  venue_en            TEXT NOT NULL DEFAULT '',
  maps_url            TEXT NOT NULL DEFAULT '',
  jurisdiction_scope  TEXT NOT NULL DEFAULT 'STATE',
  target_division_id  INTEGER REFERENCES vibhags(id) ON DELETE RESTRICT,
  target_district_id  INTEGER REFERENCES districts(id) ON DELETE RESTRICT,
  highlights_mr       TEXT NOT NULL DEFAULT '',
  highlights_en       TEXT NOT NULL DEFAULT '',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at         TIMESTAMPTZ,
  created_by          INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT melawa_scope_chk CHECK (jurisdiction_scope IN ('STATE', 'DIVISION', 'DISTRICT')),
  CONSTRAINT melawa_target_chk CHECK (
    (jurisdiction_scope = 'STATE'    AND target_division_id IS NULL AND target_district_id IS NULL) OR
    (jurisdiction_scope = 'DIVISION' AND target_division_id IS NOT NULL AND target_district_id IS NULL) OR
    (jurisdiction_scope = 'DISTRICT' AND target_division_id IS NOT NULL AND target_district_id IS NOT NULL)
  ),
  CONSTRAINT melawa_dates_chk CHECK (end_date IS NULL OR end_date >= event_date)
);
CREATE INDEX IF NOT EXISTS idx_melawa_active ON melawa_events(is_active, deleted_at, event_date);

-- ====================================================
-- PUBLIC SUGGESTIONS AND GRIEVANCES
-- One row per ticket. The ticket number is derived from the id once the row
-- exists, so it can never collide. `escalation_level` is advanced only by the
-- SLA sweep: 1 = reminders sent to the district (copying the division),
-- 2 = escalated to the state as overdue / critical.
-- ====================================================

CREATE TABLE IF NOT EXISTS grievances (
  id                  SERIAL PRIMARY KEY,
  ticket_no           TEXT UNIQUE,
  submission_type     TEXT NOT NULL,
  division_id         INTEGER NOT NULL REFERENCES vibhags(id) ON DELETE RESTRICT,
  district_id         INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  mobile              TEXT NOT NULL,
  subject             TEXT NOT NULL,
  description         TEXT NOT NULL,
  attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status              TEXT NOT NULL DEFAULT 'NEW',
  priority            TEXT NOT NULL DEFAULT 'NORMAL',
  escalation_level    SMALLINT NOT NULL DEFAULT 0,
  acknowledged_at     TIMESTAMPTZ,
  acknowledged_by     INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  action_taken_notes  TEXT NOT NULL DEFAULT '',
  resolved_at         TIMESTAMPTZ,
  resolved_by         INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  closed_at           TIMESTAMPTZ,
  last_reminder_at    TIMESTAMPTZ,
  l1_escalated_at     TIMESTAMPTZ,
  l2_escalated_at     TIMESTAMPTZ,
  closure_notified_at TIMESTAMPTZ,
  feedback_token      TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  satisfaction_rating SMALLINT,
  satisfaction_comment TEXT NOT NULL DEFAULT '',
  rated_at            TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grievances_type_chk CHECK (submission_type IN ('SUGGESTION', 'COMPLAINT')),
  CONSTRAINT grievances_status_chk CHECK (status IN ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  CONSTRAINT grievances_priority_chk CHECK (priority IN ('NORMAL', 'HIGH')),
  CONSTRAINT grievances_rating_chk CHECK (satisfaction_rating IS NULL OR satisfaction_rating BETWEEN 1 AND 5),
  -- The mandatory resolution rule, enforced where no client can skip it.
  CONSTRAINT grievances_resolution_notes_chk CHECK (
    status NOT IN ('RESOLVED', 'CLOSED') OR LENGTH(TRIM(action_taken_notes)) > 0
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_grievances_feedback_token ON grievances(feedback_token);
CREATE INDEX IF NOT EXISTS idx_grievances_scope ON grievances(division_id, district_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_grievances_open ON grievances(status, created_at) WHERE deleted_at IS NULL;

-- Every status change, note and escalation on a ticket, oldest first.
CREATE TABLE IF NOT EXISTS grievance_events (
  id            SERIAL PRIMARY KEY,
  grievance_id  INTEGER NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  actor_id      INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grievance_events_ticket ON grievance_events(grievance_id, created_at);

-- ====================================================
-- NOTIFICATIONS
-- `notifications` is the in-app bell, one row per recipient.
-- `message_outbox` records every SMS and e-mail the platform sends, whether a
-- gateway is configured or not, so a missing integration is visible rather
-- than silently dropping alerts.
-- ====================================================

CREATE TABLE IF NOT EXISTS notifications (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  link          TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general',
  priority      TEXT NOT NULL DEFAULT 'NORMAL',
  grievance_id  INTEGER REFERENCES grievances(id) ON DELETE CASCADE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS message_outbox (
  id            SERIAL PRIMARY KEY,
  channel       TEXT NOT NULL,
  recipient     TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'QUEUED',
  error         TEXT NOT NULL DEFAULT '',
  grievance_id  INTEGER REFERENCES grievances(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,
  CONSTRAINT message_outbox_channel_chk CHECK (channel IN ('SMS', 'EMAIL')),
  CONSTRAINT message_outbox_status_chk CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'LOGGED'))
);
CREATE INDEX IF NOT EXISTS idx_message_outbox_status ON message_outbox(status, created_at);
