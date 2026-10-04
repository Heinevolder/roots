import path from "node:path";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data");
export const RECIPES_DIR = path.join(DATA_DIR, "recipes");
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const ITEMS_FILE = path.join(DATA_DIR, "items.yaml");
export const DB_FILE = path.join(DATA_DIR, "roots.db");
