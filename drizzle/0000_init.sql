CREATE TABLE `cooked_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_slug` text NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`item` text NOT NULL,
	`amount` real,
	`unit` text,
	`source` text NOT NULL,
	`recipe_slugs` text,
	`checked` integer DEFAULT false NOT NULL,
	`checked_at` integer,
	`dismissed` integer DEFAULT false NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	`rev` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `list_items_rev` ON `list_items` (`rev`);--> statement-breakpoint
CREATE TABLE `meal_plan` (
	`date` text PRIMARY KEY NOT NULL,
	`recipe_slug` text,
	`servings` integer DEFAULT 4 NOT NULL,
	`note` text,
	`shopped_at` integer
);
--> statement-breakpoint
CREATE TABLE `purchase_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item` text NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item` text NOT NULL,
	`amount` real,
	`unit` text
);
