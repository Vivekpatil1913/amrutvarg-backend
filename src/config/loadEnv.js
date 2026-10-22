import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Loads env files from the project root. Earlier files win, and real process
// env vars always win over files.
//   production:  .env.production.local (secrets, gitignored) → .env.production (committed)
//   otherwise:   .env.<mode>.local → .env.<mode> → .env
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mode = process.env.NODE_ENV || "development";
const files = [`.env.${mode}.local`, `.env.${mode}`];
if (mode !== "production") files.push(".env");

for (const file of files) {
  let content;
  try {
    content = readFileSync(resolve(root, file), "utf-8");
  } catch {
    continue;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
