import fs from "node:fs";
import { DATA_DIR } from "./lib/paths";

// Say where data lives, and fail loudly if it can't be written (e.g. DATA_DIR=./data in Docker).
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
  console.log(`Roots: data i ${DATA_DIR}`);
} catch {
  console.error(
    `Roots: kan ikke skrive til datamappen ${DATA_DIR}. ` +
      `I Docker/Coolify skal DATA_DIR være /data (eller fjernes), og /data skal være et volume.`,
  );
}
