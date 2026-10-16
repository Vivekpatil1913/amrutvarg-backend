// Field validation for a video or reel.
// Run with: npm test
//
// The conditional source rule is what these mostly pin: a row must carry the
// content its source_type claims, and the source that was not chosen is
// cleared so a stale file reference cannot survive a switch to a link.

import test from "node:test";
import assert from "node:assert/strict";
import { videoSchema, VIDEO_CATEGORIES } from "./videos.schema.js";

const UPLOADED = {
  title_mr: "सूर्यनमस्कार सत्र",
  title_en: "Surya Namaskar session",
  desc_mr: "दैनिक सत्रातील व्यायाम प्रकार.",
  desc_en: "",
  content_type: "video",
  source_type: "upload",
  media_id: 7,
  media_url: "/uploads/video/1760000000000-abc123.mp4",
  external_url: "",
  thumbnail_id: 8,
  thumbnail_url: "/uploads/media/1760000000000-def456.jpg",
  category: "session",
  duration_seconds: 612,
  published: true,
  display_order: 0,
};

const LINKED = {
  ...UPLOADED,
  source_type: "url",
  media_id: null,
  media_url: "",
  external_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};

const parse = (over = {}, base = UPLOADED) => videoSchema.safeParse({ ...base, ...over });
const fieldsOf = (r) => r.error.issues.map((i) => i.path.join("."));

test("a complete uploaded video is valid", () => {
  const r = videoSchema.safeParse(UPLOADED);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

test("a complete linked video is valid", () => {
  const r = videoSchema.safeParse(LINKED);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
});

// ── required fields ─────────────────────────────────────────────────────────

test("a Marathi title is required", () => {
  assert.equal(parse({ title_mr: "" }).success, false);
  assert.equal(parse({ title_mr: "   " }).success, false);
  assert.ok(fieldsOf(parse({ title_mr: "" })).includes("title_mr"));
});

test("content type must be video or reel", () => {
  assert.equal(parse({ content_type: "reel" }).success, true);
  assert.equal(parse({ content_type: "short" }).success, false);
  assert.equal(parse({ content_type: "" }).success, false);
});

test("source type must be upload or url", () => {
  assert.equal(parse({ source_type: "embed" }).success, false);
});

test("a category outside the list is rejected", () => {
  assert.equal(parse({ category: "session" }).success, true);
  assert.equal(parse({ category: "whatever" }).success, false);
  for (const c of VIDEO_CATEGORIES) assert.equal(parse({ category: c }).success, true, c);
});

// ── the conditional source rule ─────────────────────────────────────────────

test("an upload without a file is rejected", () => {
  const r = parse({ media_url: "" });
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("media_url"));
});

test("a URL source without a URL is rejected", () => {
  const r = parse({ external_url: "" }, LINKED);
  assert.equal(r.success, false);
  assert.ok(fieldsOf(r).includes("external_url"));
});

test("choosing upload clears any external URL that was left behind", () => {
  const r = parse({ external_url: "https://youtu.be/dQw4w9WgXcQ" });
  assert.equal(r.success, true);
  assert.equal(r.data.external_url, "");
  assert.equal(r.data.media_url, UPLOADED.media_url);
});

test("choosing a URL clears any uploaded file that was left behind", () => {
  const r = parse({ media_url: "/uploads/video/old.mp4", media_id: 3 }, LINKED);
  assert.equal(r.success, true);
  assert.equal(r.data.media_url, "");
  assert.equal(r.data.media_id, null);
  assert.equal(r.data.external_url, LINKED.external_url);
});

// ── URL safety ──────────────────────────────────────────────────────────────

test("an unsafe external URL is rejected", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "not a url",
    "//evil.test/clip.mp4",
  ]) {
    const r = parse({ external_url: bad }, LINKED);
    assert.equal(r.success, false, bad);
    assert.ok(fieldsOf(r).includes("external_url"), bad);
  }
});

test("an unrecognised but safe https page is accepted and stored as a link", () => {
  assert.equal(parse({ external_url: "https://example.org/watch/intro" }, LINKED).success, true);
});

// ── stored file paths ───────────────────────────────────────────────────────

test("a media path outside /uploads/ is rejected", () => {
  for (const bad of [
    "../../etc/passwd",
    "/etc/passwd",
    "https://evil.test/clip.mp4",
    "C:/uploads/video/clip.mp4",
  ]) {
    assert.equal(parse({ media_url: bad }).success, false, bad);
  }
});

test("a thumbnail outside /uploads/ is rejected", () => {
  assert.equal(parse({ thumbnail_url: "https://evil.test/x.jpg" }).success, false);
  assert.equal(parse({ thumbnail_url: "" }).success, true);
});

// ── numbers and defaults ────────────────────────────────────────────────────

test("duration is optional and stays null when unknown", () => {
  const r = parse({ duration_seconds: null });
  assert.equal(r.success, true);
  assert.equal(r.data.duration_seconds, null);
  assert.equal(parse({ duration_seconds: -1 }).success, false);
  assert.equal(parse({ duration_seconds: 86401 }).success, false);
  assert.equal(parse({ duration_seconds: 1.5 }).success, false);
});

test("display order must be a whole number within range", () => {
  assert.equal(parse({ display_order: -1 }).success, false);
  assert.equal(parse({ display_order: 10000 }).success, false);
  assert.equal(parse({ display_order: 12 }).success, true);
});

test("a new video defaults to unpublished", () => {
  const r = videoSchema.safeParse({
    title_mr: "शीर्षक",
    content_type: "video",
    source_type: "url",
    external_url: "https://youtu.be/dQw4w9WgXcQ",
  });
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
  assert.equal(r.data.published, false);
  assert.equal(r.data.category, "general");
  assert.equal(r.data.display_order, 0);
});
