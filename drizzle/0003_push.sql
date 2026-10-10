CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`device` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL
);
