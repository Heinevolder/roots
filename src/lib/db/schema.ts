import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const mealPlan = sqliteTable("meal_plan", {
  date: text("date").primaryKey(), // YYYY-MM-DD
  recipeSlug: text("recipe_slug"),
  servings: integer("servings").notNull().default(4),
  note: text("note"),
  shoppedAt: integer("shopped_at"), // set when "Færdig med at handle" covered this day
});

export const listItems = sqliteTable(
  "list_items",
  {
    id: text("id").primaryKey(),
    item: text("item").notNull(),
    amount: real("amount"),
    unit: text("unit"),
    source: text("source", { enum: ["recipe", "staple", "manual"] }).notNull(),
    recipeSlugs: text("recipe_slugs"), // comma separated
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
    checkedAt: integer("checked_at"),
    dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false), // "Har vi allerede"
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false), // tombstone for sync
    updatedAt: integer("updated_at").notNull(), // ms, last-write-wins
    rev: integer("rev").notNull(), // server sequence for incremental pulls
  },
  (t) => [index("list_items_rev").on(t.rev)],
);

export const staples = sqliteTable("staples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  item: text("item").notNull(),
  amount: real("amount"),
  unit: text("unit"),
});

export const purchaseLog = sqliteTable("purchase_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  item: text("item").notNull(),
  date: text("date").notNull(),
});

export const cookedLog = sqliteTable("cooked_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeSlug: text("recipe_slug").notNull(),
  date: text("date").notNull(),
});

export type ListItem = typeof listItems.$inferSelect;
export type MealPlanDay = typeof mealPlan.$inferSelect;
export type Staple = typeof staples.$inferSelect;

/** Inspiration deck: real recipe pages Claude found on the web. */
export const inspiration = sqliteTable(
  "inspiration",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    pitch: text("pitch"),
    imageUrl: text("image_url"),
    site: text("site"),
    time: integer("time"),
    ingredients: text("ingredients"), // JSON string[] preview from the page
    query: text("query"),
    status: text("status", { enum: ["new", "saving", "saved", "skipped", "failed"] }).notNull().default("new"),
    recipeSlug: text("recipe_slug"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("inspiration_status").on(t.status)],
);

export type Inspiration = typeof inspiration.$inferSelect;

/** Small shared key/value settings (e.g. the days currently being planned). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
