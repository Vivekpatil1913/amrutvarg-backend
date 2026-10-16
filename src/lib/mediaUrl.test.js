// External media URL safety and embed building.
// Run with: npm test
//
// The point of these tests is the one rule that matters: an embed src is never
// the string that was supplied. It is rebuilt from a parsed ID, so a crafted
// URL cannot smuggle parameters — or a different host — into an iframe.

import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeHttpUrl, parseSafeUrl, videoEmbed, audioEmbed, videoProvider, MAX_URL_LENGTH,
} from "./mediaUrl.js";

// ── protocol and shape ──────────────────────────────────────────────────────

test("http and https are the only accepted protocols", () => {
  assert.equal(isSafeHttpUrl("https://example.org/a.mp4"), true);
  assert.equal(isSafeHttpUrl("http://example.org/a.mp4"), true);
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "blob:https://example.org/abc",
    "vbscript:msgbox(1)",
    "ftp://example.org/a.mp4",
  ]) {
    assert.equal(isSafeHttpUrl(bad), false, `${bad} should be rejected`);
  }
});

test("an empty, blank or non-URL value is rejected", () => {
  for (const bad of ["", "   ", null, undefined, "not a url", "/relative/path", "//example.org"]) {
    assert.equal(isSafeHttpUrl(bad), false);
  }
});

test("embedded credentials are rejected", () => {
  assert.equal(isSafeHttpUrl("https://user:pass@example.org/a.mp4"), false);
  assert.equal(isSafeHttpUrl("https://user@example.org/a.mp4"), false);
});

test("an over-long URL is rejected", () => {
  assert.equal(isSafeHttpUrl(`https://example.org/${"a".repeat(MAX_URL_LENGTH)}`), false);
});

test("surrounding whitespace is trimmed, not rejected", () => {
  assert.equal(parseSafeUrl("  https://example.org/a.mp4  ")?.href, "https://example.org/a.mp4");
});

// ── YouTube ─────────────────────────────────────────────────────────────────

test("every YouTube URL shape resolves to the same canonical embed", () => {
  const expected = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0";
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
  ]) {
    const r = videoEmbed(url);
    assert.equal(r.provider, "youtube", url);
    assert.equal(r.mode, "iframe", url);
    assert.equal(r.src, expected, url);
  }
});

test("extra query parameters never survive into the embed src", () => {
  const r = videoEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1&origin=https://evil.test");
  assert.equal(r.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
  assert.ok(!r.src.includes("evil"));
  assert.ok(!r.src.includes("enablejsapi"));
});

test("a lookalike host is not treated as YouTube", () => {
  for (const url of [
    "https://evil-youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://notyoutu.be/dQw4w9WgXcQ",
  ]) {
    assert.equal(videoProvider(url), "link", url);
  }
});

test("a malformed YouTube id falls back to a plain link", () => {
  assert.equal(videoProvider("https://www.youtube.com/watch?v=tooshort"), "link");
  assert.equal(videoProvider("https://www.youtube.com/watch?v=has/slash11"), "link");
  assert.equal(videoProvider("https://www.youtube.com/watch"), "link");
});

// ── Vimeo and Instagram ─────────────────────────────────────────────────────

test("Vimeo resolves to the player embed", () => {
  const r = videoEmbed("https://vimeo.com/123456789");
  assert.equal(r.provider, "vimeo");
  assert.equal(r.src, "https://player.vimeo.com/video/123456789");
  assert.equal(videoEmbed("https://player.vimeo.com/video/123456789").src, "https://player.vimeo.com/video/123456789");
});

test("Instagram reels resolve to the reel embed", () => {
  for (const url of [
    "https://www.instagram.com/reel/Cx1y2z3AbCd/",
    "https://instagram.com/reels/Cx1y2z3AbCd",
    "https://www.instagram.com/p/Cx1y2z3AbCd/",
    "https://www.instagram.com/amrutvarg/reel/Cx1y2z3AbCd/",
  ]) {
    const r = videoEmbed(url);
    assert.equal(r.provider, "instagram", url);
    assert.equal(r.src, "https://www.instagram.com/reel/Cx1y2z3AbCd/embed/", url);
  }
});

// ── direct files ────────────────────────────────────────────────────────────

test("an https video file plays natively; http is link-only", () => {
  const https = videoEmbed("https://cdn.example.org/clips/intro.mp4");
  assert.equal(https.provider, "file");
  assert.equal(https.mode, "video");
  assert.equal(https.src, "https://cdn.example.org/clips/intro.mp4");

  // Mixed content is blocked by the browser on an https page, so it is offered
  // as a link rather than a player that would silently fail.
  const http = videoEmbed("http://cdn.example.org/clips/intro.mp4");
  assert.equal(http.mode, "link");
  assert.equal(http.src, "");
});

test("an unrecognised page is storable as a link, never embedded", () => {
  const r = videoEmbed("https://example.org/some/video/page");
  assert.equal(r.provider, "link");
  assert.equal(r.mode, "link");
  assert.equal(r.src, "");
  assert.equal(r.url, "https://example.org/some/video/page");
});

test("an unsafe URL yields null rather than a link", () => {
  assert.equal(videoEmbed("javascript:alert(1)"), null);
  assert.equal(audioEmbed("javascript:alert(1)"), null);
});

// ── audio ───────────────────────────────────────────────────────────────────

test("audio files play natively", () => {
  for (const ext of ["mp3", "wav", "m4a", "aac", "oga", "flac"]) {
    const r = audioEmbed(`https://cdn.example.org/ep1.${ext}`);
    assert.equal(r.provider, "file", ext);
    assert.equal(r.mode, "audio", ext);
  }
});

test("Spotify episodes and shows resolve to the Spotify embed", () => {
  assert.equal(
    audioEmbed("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk").src,
    "https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk"
  );
  assert.equal(
    audioEmbed("https://open.spotify.com/intl-hi/show/4rOoJ6Egrf8K2IrywzwOMk").src,
    "https://open.spotify.com/embed/show/4rOoJ6Egrf8K2IrywzwOMk"
  );
});

test("other podcast hosts are offered as an external listening link", () => {
  const r = audioEmbed("https://podcasts.apple.com/in/podcast/amrut/id123456789");
  assert.equal(r.provider, "link");
  assert.equal(r.mode, "link");
  assert.equal(r.src, "");
});

// ── YouTube: video vs channel vs playlist ───────────────────────────────────
//
// REQ-11's rule: a channel link must open the channel and a video link the
// video. Converting one into the other sends the visitor somewhere the editor
// did not choose, so each is recognised on its own terms.

test("every YouTube video form is reported as a video", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
  ]) {
    assert.equal(videoEmbed(url).kind, "video", url);
  }
});

test("a channel is a channel, never turned into a video embed", () => {
  for (const url of [
    "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
    "https://www.youtube.com/@amrutvarg",
    "https://www.youtube.com/c/AmrutVarg",
    "https://www.youtube.com/user/AmrutVarg",
  ]) {
    const r = videoEmbed(url);
    assert.equal(r.kind, "channel", url);
    assert.equal(r.provider, "youtube", url);
    // The decisive part: no iframe, and no src to put in one.
    assert.equal(r.mode, "link", url);
    assert.equal(r.src, "", url);
  }
});

test("a channel link keeps pointing at that channel", () => {
  assert.equal(
    videoEmbed("https://www.youtube.com/@amrutvarg").url,
    "https://www.youtube.com/@amrutvarg"
  );
  assert.equal(
    videoEmbed("https://youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw?view_as=subscriber").url,
    "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw"
  );
});

test("a malformed channel id is not accepted as a channel", () => {
  for (const url of [
    "https://www.youtube.com/channel/notachannelid",
    "https://www.youtube.com/channel/",
    "https://www.youtube.com/@ab",
  ]) {
    assert.notEqual(videoEmbed(url).kind, "channel", url);
  }
});

test("a playlist is a playlist and embeds as a series", () => {
  const r = videoEmbed("https://www.youtube.com/playlist?list=PLabcdefghijkl");
  assert.equal(r.kind, "playlist");
  assert.equal(r.src, "https://www.youtube-nocookie.com/embed/videoseries?list=PLabcdefghijkl");
});

test("a video that merely sits in a playlist is still a video", () => {
  // /watch?v=…&list=… names a video. Treating it as a playlist would start
  // the viewer somewhere other than the video that was linked.
  const r = videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijkl");
  assert.equal(r.kind, "video");
  assert.equal(r.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
});

test("a channel on a lookalike host is not a YouTube channel", () => {
  for (const url of [
    "https://youtube.com.evil.test/@amrutvarg",
    "https://evil-youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
  ]) {
    const r = videoEmbed(url);
    assert.equal(r.kind, "page", url);
    assert.equal(r.provider, "link", url);
  }
});

test("every result says what it is", () => {
  assert.equal(videoEmbed("https://cdn.test/a.mp4").kind, "file");
  assert.equal(videoEmbed("https://example.org/page").kind, "page");
  assert.equal(videoEmbed("https://vimeo.com/123456789").kind, "video");
  assert.equal(videoEmbed("https://www.instagram.com/reel/Cx1y2z3AbCd/").kind, "video");
});
