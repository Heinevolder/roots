CREATE TABLE `inspiration` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`pitch` text,
	`image_url` text,
	`site` text,
	`time` integer,
	`ingredients` text,
	`query` text,
	`status` text DEFAULT 'new' NOT NULL,
	`recipe_slug` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inspiration_url_unique` ON `inspiration` (`url`);--> statement-breakpoint
CREATE INDEX `inspiration_status` ON `inspiration` (`status`);