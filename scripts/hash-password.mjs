// Usage: node scripts/hash-password.mjs
// Asks for the password (hidden) and prints APP_PASSWORD_HASH (base64, safe in .env/Coolify) and a fresh SESSION_SECRET.
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

function ask(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let pw = "";
    stdin.on("data", (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        process.stdout.write("\n");
        resolve(pw);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else if (ch === "\u007f") {
        pw = pw.slice(0, -1);
      } else {
        pw += ch;
      }
    });
  });
}

const pw = process.argv[2] ?? (await ask("Adgangskode: "));
if (!pw || pw.length < 8) {
  console.error("Vælg en adgangskode på mindst 8 tegn.");
  process.exit(1);
}
if (!process.argv[2] && (await ask("Gentag: ")) !== pw) {
  console.error("Adgangskoderne er ikke ens.");
  process.exit(1);
}
const h = await hash(pw);
console.log(`APP_PASSWORD_HASH=${Buffer.from(h).toString("base64")}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString("hex")}`);
