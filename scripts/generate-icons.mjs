// Generates the app/PWA icons from one SVG mark.
// Usage: node scripts/generate-icons.mjs
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const GREEN = "#2f5d3a";
const LEAF = "#9fcf93";
const CREAM = "#f5f2ea";
const SOIL = "#e08a5f";

// Mark drawn on a 512 canvas, kept inside the maskable safe zone (r ≈ 205 around the centre).
const mark = `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(256 256) scale(1.2) translate(-256 -258)">
    <path d="M256 272 V214" stroke="${CREAM}" stroke-width="22"/>
    <path d="M256 214 C 262 162 304 128 360 128 C 358 180 318 214 256 214 Z" fill="${LEAF}"/>
    <path d="M256 222 C 248 186 214 160 166 162 C 170 204 204 228 256 222 Z" fill="${LEAF}"/>
    <path d="M256 280 C 256 320 252 350 242 384" stroke="${CREAM}" stroke-width="22"/>
    <path d="M255 304 C 230 314 206 326 190 352" stroke="${CREAM}" stroke-width="18"/>
    <path d="M257 300 C 282 308 308 320 322 346" stroke="${CREAM}" stroke-width="18"/>
    <path d="M160 274 H352" stroke="${SOIL}" stroke-width="22"/>
  </g>`;

const svg = ({ radius = 0 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
  `<rect width="512" height="512" rx="${radius}" fill="${GREEN}"/>${mark}</svg>`;

const png = (source, size, out) =>
  sharp(Buffer.from(source), { density: 300 }).resize(size, size).png().toFile(out);

const rounded = svg({ radius: 112 });
const fullBleed = svg();

await writeFile("src/app/icon.svg", rounded);
await png(fullBleed, 180, "src/app/apple-icon.png");
await png(rounded, 192, "public/icon-192.png");
await png(rounded, 512, "public/icon-512.png");
await png(fullBleed, 512, "public/icon-maskable-512.png");
console.log("Icons written.");
