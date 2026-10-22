import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  hasAllowedImageSignature, hasAllowedVideoSignature, hasAllowedAudioSignature,
} from "./upload.js";

// Container headers, written byte for byte. Only the opening bytes are read,
// so these stand in for real media files without shipping any.
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom", "ascii")]);
const MOV = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  ", "ascii")]);
const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A ", "ascii")]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
const OGG = Buffer.concat([Buffer.from("OggS", "ascii"), Buffer.from([0x00, 0x02, 0x00, 0x00])]);
const WAV = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([36, 0, 0, 0]), Buffer.from("WAVE", "ascii")]);
const MP3_ID3 = Buffer.concat([Buffer.from("ID3", "ascii"), Buffer.from([0x03, 0x00, 0x00, 0x00])]);
const MP3_SYNC = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
const FLAC = Buffer.concat([Buffer.from("fLaC", "ascii"), Buffer.from([0x00, 0x00, 0x00, 0x22])]);
const HTML = Buffer.from("<html><script>alert(1)</script>", "ascii");

test("image uploads require matching image file signatures", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "amrut-upload-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const png = path.join(dir, "image.png");
  await writeFile(png, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(await hasAllowedImageSignature(png, { expectedMime: "image/png" }), true);
  assert.equal(await hasAllowedImageSignature(png, { expectedMime: "image/jpeg" }), false);

  const text = path.join(dir, "fake.png");
  await writeFile(text, "not an image");
  assert.equal(await hasAllowedImageSignature(text), false);

  const gif = path.join(dir, "image.gif");
  await writeFile(gif, "GIF89a");
  assert.equal(await hasAllowedImageSignature(gif), true);
  assert.equal(await hasAllowedImageSignature(gif, { allowGif: false }), false);
});

// Writes each buffer to its own file and hands back the paths by name.
async function withFiles(t, files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "amrut-upload-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const out = {};
  for (const [name, bytes] of Object.entries(files)) {
    out[name] = path.join(dir, name);
    await writeFile(out[name], bytes);
  }
  return out;
}

test("video uploads are identified by their container, not their extension", async (t) => {
  const f = await withFiles(t, {
    "clip.mp4": MP4, "clip.mov": MOV, "clip.webm": WEBM, "clip.ogv": OGG,
    "payload.mp4": HTML, "empty.mp4": Buffer.alloc(0),
  });

  assert.equal(await hasAllowedVideoSignature(f["clip.mp4"]), true);
  assert.equal(await hasAllowedVideoSignature(f["clip.mov"]), true);
  assert.equal(await hasAllowedVideoSignature(f["clip.webm"]), true);
  assert.equal(await hasAllowedVideoSignature(f["clip.ogv"]), true);

  // The whole point: a .mp4 filename over HTML bytes is refused.
  assert.equal(await hasAllowedVideoSignature(f["payload.mp4"]), false);
  assert.equal(await hasAllowedVideoSignature(f["empty.mp4"]), false);
});

test("a video whose bytes contradict its declared type is refused", async (t) => {
  const f = await withFiles(t, { "clip.mp4": MP4, "clip.webm": WEBM });

  assert.equal(await hasAllowedVideoSignature(f["clip.mp4"], { expectedMime: "video/mp4" }), true);
  assert.equal(await hasAllowedVideoSignature(f["clip.mp4"], { expectedMime: "video/x-m4v" }), true);
  assert.equal(await hasAllowedVideoSignature(f["clip.mp4"], { expectedMime: "video/webm" }), false);
  assert.equal(await hasAllowedVideoSignature(f["clip.webm"], { expectedMime: "video/webm" }), true);
  // An audio type can never satisfy the video check.
  assert.equal(await hasAllowedVideoSignature(f["clip.mp4"], { expectedMime: "audio/mp4" }), false);
});

test("audio uploads are identified by their container", async (t) => {
  const f = await withFiles(t, {
    "ep.mp3": MP3_ID3, "raw.mp3": MP3_SYNC, "ep.wav": WAV, "ep.m4a": M4A,
    "ep.flac": FLAC, "ep.oga": OGG, "payload.mp3": HTML,
  });

  assert.equal(await hasAllowedAudioSignature(f["ep.mp3"]), true);
  assert.equal(await hasAllowedAudioSignature(f["raw.mp3"]), true);
  assert.equal(await hasAllowedAudioSignature(f["ep.wav"]), true);
  assert.equal(await hasAllowedAudioSignature(f["ep.m4a"]), true);
  assert.equal(await hasAllowedAudioSignature(f["ep.flac"]), true);
  assert.equal(await hasAllowedAudioSignature(f["ep.oga"]), true);

  assert.equal(await hasAllowedAudioSignature(f["payload.mp3"]), false);
});

test("an audio file whose bytes contradict its declared type is refused", async (t) => {
  const f = await withFiles(t, { "ep.mp3": MP3_ID3, "ep.wav": WAV, "ep.m4a": M4A });

  assert.equal(await hasAllowedAudioSignature(f["ep.mp3"], { expectedMime: "audio/mpeg" }), true);
  assert.equal(await hasAllowedAudioSignature(f["ep.mp3"], { expectedMime: "audio/wav" }), false);
  assert.equal(await hasAllowedAudioSignature(f["ep.wav"], { expectedMime: "audio/x-wav" }), true);
  assert.equal(await hasAllowedAudioSignature(f["ep.m4a"], { expectedMime: "audio/x-m4a" }), true);
  assert.equal(await hasAllowedAudioSignature(f["ep.wav"], { expectedMime: "video/mp4" }), false);
});
