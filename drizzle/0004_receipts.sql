CREATE TABLE `receipt_aliases` (
	`text` text PRIMARY KEY NOT NULL,
	`item` text NOT NULL,
	`category` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipt_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`text` text NOT NULL,
	`price` real NOT NULL,
	`item` text NOT NULL,
	`category` text NOT NULL,
	`on_list` integer DEFAULT false NOT NULL,
	`sure` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipt_lines_trip` ON `receipt_lines` (`trip_id`);--> statement-breakpoint
CREATE INDEX `receipt_lines_item` ON `receipt_lines` (`item`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`store` text,
	`total` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `purchase_log` ADD `trip_id` integer;