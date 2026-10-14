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
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
