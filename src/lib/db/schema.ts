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
  tripId: integer("trip_id"),
});

/** One shopping trip: created by "Færdig med at handle", or by a receipt that has no trip to join. */
export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  store: text("store"),
  total: real("total"), // kr from the receipt; null until a receipt is added
  createdAt: integer("created_at").notNull(),
});

/** Receipt lines, each folded together with its discount/pant. `onList` = it was on the shopping list. */
export const receiptLines = sqliteTable(
  "receipt_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    text: text("text").notNull(), // as printed, e.g. "ØKO GULERØD 1KG"
    price: real("price").notNull(), // kr paid for the line
    item: text("item").notNull(), // short Danish name, catalogue name when there is one
    category: text("category").notNull(),
    onList: integer("on_list", { mode: "boolean" }).notNull().default(false),
    sure: integer("sure", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("receipt_lines_trip").on(t.tripId), index("receipt_lines_item").on(t.item)],
);

/** Learned receipt text -> item, so the same product is matched the same way next time. */
export const receiptAliases = sqliteTable("receipt_aliases", {
  text: text("text").primaryKey(), // normalized receipt text
  item: text("item").notNull(),
  category: text("category").notNull(),
});

export type Trip = typeof trips.$inferSelect;
export type ReceiptLine = typeof receiptLines.$inferSelect;

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

/** Web Push: one row per browser that turned notifications on. `device` is the roots_device cookie. */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  device: text("device").notNull(),
  name: text("name"), // who uses this device, shown as "Anna har tilføjet …"
  createdAt: integer("created_at").notNull(),
});
