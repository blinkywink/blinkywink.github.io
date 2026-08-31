#!/usr/bin/env node
/** Print a PostgREST anon JWT for VITE_SUPABASE_PUBLISHABLE_KEY. */
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  const p = resolve(root, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const secret = process.env.JWT_SECRET ?? "";
if (secret.length < 32) {
  console.error("Set JWT_SECRET in selfhost/.env (32+ characters).");
  process.exit(1);
}

const b64url = (value) =>
  Buffer.from(value).toString("base64url");

const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = b64url(
  JSON.stringify({
    role: "anon",
    iss: "monkeycards",
    iat: Math.floor(Date.now() / 1000),
  }),
);
const data = `${header}.${payload}`;
const sig = createHmac("sha256", secret).update(data).digest("base64url");
console.log(`${data}.${sig}`);
