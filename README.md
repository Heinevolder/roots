# Roots

Private Danish web app for the family: dinner plan → shared shopping list, sorted by Føtex/Bilka aisle, usable offline in the store. Plan: [Roots – app plan](https://claude.ai/code/artifact/8d9760e1-5019-497b-b932-7c0e6dd3350b).

**Stack:** Next.js 16 (App Router, Tailwind 4) as the only process · recipes as Markdown files · everything else in one SQLite file (better-sqlite3 + Drizzle) · live ticks over Server-Sent Events · offline via service worker + IndexedDB (Dexie) outbox · one shared password (argon2 + iron-session cookie).

## Local development

```bash
pnpm install
node scripts/hash-password.mjs > .env.local   # asks for the password
echo "DATA_DIR=./data" >> .env.local
mkdir -p data/recipes && cp seed/recipes/*.md data/recipes/   # optional sample recipes
pnpm dev
```

`data/items.yaml` is created from `seed/items.yaml` on first start. SQLite migrations run automatically on startup. The service worker only registers in production builds (`pnpm build && pnpm start`).

After changing `src/lib/db/schema.ts`: `pnpm drizzle-kit generate`.

## Data

```
data/
  recipes/*.md   one file per recipe (YAML frontmatter + steps), slug = file name
  images/        recipe photos
  items.yaml     grocery catalogue + aisles in walking order (also editable under "Mere")
  roots.db       SQLite: meal_plan, list_items, staples, purchase_log, cooked_log
```

Recipes and `items.yaml` can be edited by hand; changes are picked up automatically.

## How the list works

- Planned, not-yet-shopped days from today on are summed per item + unit (aliases like "gule løg" → "løg"), scaled by servings. Changing the plan or a recipe regenerates the recipe lines only; manual lines and staples are never touched, and ticks and "har vi" survive.
- **Har vi allerede?** hides recipe items you already have at home.
- **Færdig med at handle** logs and clears ticked items, keeps the rest, and marks the planned days as shopped.
- Every tick writes to IndexedDB first and goes to the server via an outbox; the other phone gets it over SSE. Conflicts: last write wins per item.

## Deploy with Coolify

1. New resource → **Public repository** → `https://github.com/Heinevolder/roots`, branch `main`.
2. Build pack: **Dockerfile** (not Docker Compose; Coolify provides HTTPS itself, Caddy is not needed). Port: **3000**.
3. Domain: `https://roots.heinevolder.dk` (point an A record for `roots` at the Coolify server).
4. **Persistent storage**: add a volume mounted at **`/data`** (recipes, photos, items.yaml, roots.db). Without it everything is lost on redeploy.
5. Environment variables:
   - `APP_PASSWORD_HASH` and `SESSION_SECRET`: run `node scripts/hash-password.mjs` locally (asks for the password hidden) and paste both lines.
   - `ANTHROPIC_API_KEY`
6. Deploy. The image has a built-in health check on `/login`.

To move existing data in: copy `data/` into the `/data` volume once (e.g. `docker cp data/. <container>:/data/` on the server, then restart).

## Deploy (Hetzner VPS, without Coolify)

1. Create the smallest Hetzner Cloud server (Ubuntu), SSH keys only, firewall open on 22/80/443, install Docker.
2. Point `roots.<domain>` at the server.
3. On the server:
   ```bash
   git clone <repo> roots && cd roots
   cp .env.example .env    # fill APP_PASSWORD_HASH, SESSION_SECRET, DOMAIN
   docker compose up -d --build
   ```
   Caddy fetches the HTTPS certificate automatically. `./data` is mounted into the app container, so rebuilds never touch data.

`APP_PASSWORD_HASH` from `scripts/hash-password.mjs` is base64-encoded, so there is no `$` escaping to worry about in `.env` or compose.

**Backups (to set up):** Litestream from `data/roots.db` to Hetzner Object Storage (or a nightly `sqlite3 .backup`), `data/recipes` + `items.yaml` in git, `data/images` synced nightly. Test a restore once.

## Status

- [x] M1 Foundation: login, proxy auth guard, SQLite + migrations, Docker Compose + Caddy
- [x] M2 Recipes & plan: Markdown recipes with image upload, 3-day plan with week view, servings
- [x] M3 Shopping list: generation/merging, staples, aisle order, shopping mode, SSE live sync
- [x] M4 Offline PWA: manifest, service worker, IndexedDB cache, outbox, reconnect sync
- [x] M5a AI: Inspiration swipe deck (Claude web search → only real pages that load), import from link, import from photo
- [ ] M5b: dinner suggestions from the library, forgotten-item nudges, leftovers

## AI (Claude)

Needs `ANTHROPIC_API_KEY` in `.env` (server) / `.env.local` (dev). Model: `claude-opus-5-5`, called only from route handlers.

- **Inspiration** (`/inspiration`): Claude uses web search to find recipe pages on Danish sites; the server fetches every URL and drops anything that doesn't load or isn't a single recipe, so cards are always real pages. Swipe right = Claude reads that page and saves it as a Markdown recipe (photo downloaded). Swiped URLs are never suggested again.
- **Import** (`/opskrifter/ny`): from a link (JSON-LD when the site has it, otherwise page text) or 1–4 photos (cookbook, handwritten). Produces a draft you review before saving.
- Ingredients are normalised to names in `items.yaml`, so they merge on the shopping list.
- Rough cost: a search is a few web searches plus one Opus call; an import is one call. Set a monthly spend limit in the Anthropic console.
