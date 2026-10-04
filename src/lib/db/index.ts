import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { DATA_DIR, DB_FILE } from "../paths";

type DB = BetterSQLite3Database<typeof schema>;

const g = globalThis as unknown as { __rootsDb?: DB };

function open(): DB {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(DB_FILE);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export const db: DB = (g.__rootsDb ??= open());
export { schema };
