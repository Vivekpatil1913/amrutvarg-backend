// Field validation for a podcast episode.
// Run with: npm test
//
// The source rules mirror videos.test.js deliberately: the two modules are
// meant to behave the same way, and a divergence should fail here.

import test from "node:test";
import assert from "node:assert/strict";
import { podcastSchema, PODCAST_CATEGORIES } from "./podcasts.schema.js";

const UPLOADED = {
  title_mr: "भाग १ — अमृत वर्ग म्हणजे काय?",
  title_en: "Episode 1 — What is Amrut Varg?",
  desc_mr: "उपक्रमाची ओळख.",
  desc_en: "",
  source_type: "upload",
  media_id: 11,
  media_url: "/uploads/audio/1760000000000-abc123.mp3",
  external_url: "",
  cover_id: 12,
  cover_url: "/uploads/media/1760000000000-cover.jpg",
  category: "interview",
  duration_seconds: 1830,
  publish_date: "2026-10-01",
  published: true,
  display_order: 0,
};

const LINKED = {
  ...UPLOADED,
  source_type: "url",
  media_id: null,
  media_url: "",
  external_url: "https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk",
};

const parse = (over = {}, base = UPLOADED) => podcastSchema.safeParse({ ...base, ...over });
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("a complete uploaded episode is valid", () => {
  const r = podcastSchema.safeParse(UPLOADED);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("a complete linked episode is valid", () => {
  const r = podcastSchema.safeParse(LINKED);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("a Marathi title is required", () => {
  assert.equal(parse({ title_mr: "" }).success, false);
  assert.ok(fieldsOf(parse({ title_mr: "  " })).includes("title_mr"));
});

test("a category outside the list is rejected", () => {
  assert.equal(parse({ category: "sports" }).success, false);
  for (const c of PODCAST_CATEGORIES) assert.equal(parse({ category: c }).success, true, c);
});

// ── the conditional source rule ─────────────────────────────────────────────

test("an upload without an audio file is rejected", () => {
  const r = parse({ media_url: "" });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("media_url"));
});

test("a URL source without a URL is rejected", () => {
  const r = parse({ external_url: "" }, LINKED);
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("external_url"));
});

test("the source that was not chosen is cleared on save", () => {
  const up = parse({ external_url: "https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk" });
  assert.equal(up.data.external_url, "");

  const link = parse({ media_url: "/uploads/audio/old.mp3", media_id: 9 }, LINKED);
  assert.equal(link.data.media_url, "");
  assert.equal(link.data.media_id, null);
});

// ── URL and path safety ─────────────────────────────────────────────────────

test("an unsafe external URL is rejected", () => {
  for (const bad of ["javascript:alert(1)", "data:audio/mp3;base64,AAAA", "file:///etc/passwd", "ftp://x.test/a.mp3"]) {
    assert.equal(parse({ external_url: bad }, LINKED).success, false, bad);
  }
});

test("an audio path outside /uploads/ is rejected", () => {
  assert.equal(parse({ media_url: "../../etc/passwd" }).success, false);
  assert.equal(parse({ media_url: "https://evil.test/a.mp3" }).success, false);
});

test("a cover image outside /uploads/ is rejected", () => {
  assert.equal(parse({ cover_url: "https://evil.test/c.jpg" }).success, false);
  assert.equal(parse({ cover_url: "" }).success, true);
});

// ── dates and duration ──────────────────────────────────────────────────────

test("the publish date must be a real calendar date, or empty", () => {
  assert.equal(parse({ publish_date: "" }).success, true);
  assert.equal(parse({ publish_date: "2026-02-28" }).success, true);
  assert.equal(parse({ publish_date: "01/10/2026" }).success, false);
  assert.equal(parse({ publish_date: "2026-13-01" }).success, false);
  assert.equal(parse({ publish_date: "tomorrow" }).success, false);
});

test("duration is optional and stays null when unknown", () => {
  const r = parse({ duration_seconds: null });
  assert.equal(r.success, true);
  assert.equal(r.data.duration_seconds, null);
  assert.equal(parse({ duration_seconds: -5 }).success, false);
});

test("a new episode defaults to unpublished with no date", () => {
  const r = podcastSchema.safeParse({
    title_mr: "शीर्षक",
    source_type: "url",
    external_url: "https://podcasts.apple.com/in/podcast/amrut/id123456789",
  });
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
  assert.equal(r.data.published, false);
  assert.equal(r.data.publish_date, "");
  assert.equal(r.data.duration_seconds, null);
});
