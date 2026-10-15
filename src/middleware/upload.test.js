import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { hasAllowedImageSignature } from "./upload.js";

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
