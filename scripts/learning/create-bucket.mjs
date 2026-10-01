/**
 * Creates the private bucket that holds learning material files. Run once.
 *
 *   node scripts/learning/create-bucket.mjs
 *
 * Private means private: nothing is readable by URL. The server mints a link
 * that lasts five minutes, and only after it has checked the trainee's own link
 * or the facilitator's sign-in. Running this twice is harmless.
 */
import { readFileSync } from "node:fs";

import { ALLOWED_FILE_TYPES, LEARNING_BUCKET, MAX_FILE_BYTES } from "../../src/lib/learningFiles.ts";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

const existing = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket`, { headers })).json();
if (Array.isArray(existing) && existing.some((bucket) => bucket.name === LEARNING_BUCKET)) {
  const bucket = existing.find((b) => b.name === LEARNING_BUCKET);
  console.log(`The "${LEARNING_BUCKET}" bucket already exists (${bucket.public ? "PUBLIC — this is wrong, make it private" : "private"}).`);
  process.exit(bucket.public ? 1 : 0);
}

const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    id: LEARNING_BUCKET,
    name: LEARNING_BUCKET,
    public: false,
    file_size_limit: MAX_FILE_BYTES,
    allowed_mime_types: Object.keys(ALLOWED_FILE_TYPES),
  }),
});

if (!response.ok) {
  console.error(`Could not create the bucket: ${response.status} ${await response.text()}`);
  process.exit(1);
}

console.log(`Created the private "${LEARNING_BUCKET}" bucket, limit ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB per file.`);
