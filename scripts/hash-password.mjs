// Usage: node scripts/hash-password.mjs "din adgangskode"
// Prints APP_PASSWORD_HASH (base64, safe in .env and docker-compose) and a fresh SESSION_SECRET.
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const pw = process.argv[2];
if (!pw) {
  console.error('Brug: node scripts/hash-password.mjs "adgangskode"');
  process.exit(1);
}
const h = await hash(pw);
console.log(`APP_PASSWORD_HASH=${Buffer.from(h).toString("base64")}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString("hex")}`);
