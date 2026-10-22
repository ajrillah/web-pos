CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `product_units` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`factor` integer NOT NULL,
	`sell_price` integer NOT NULL,
	`is_base` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_units_product_id_idx` ON `product_units` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category_id` text NOT NULL,
	`type` text NOT NULL,
	`base_unit` text NOT NULL,
	`pricing_factor` integer NOT NULL,
	`cost_price` integer NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_code_unique` ON `products` ("code" COLLATE NOCASE);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE TABLE `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`qty_change` integer NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`cost_price` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_adjustments_product_id_idx` ON `stock_adjustments` (`product_id`);--> statement-breakpoint
CREATE INDEX `stock_adjustments_created_at_idx` ON `stock_adjustments` (`created_at`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`qty_change` integer NOT NULL,
	`type` text NOT NULL,
	`ref_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_movements_product_id_idx` ON `stock_movements` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_ref_id_idx` ON `stock_movements` (`ref_id`);--> statement-breakpoint
-- Default categories (docs/design.md 6.5). Fixed ids; timestamps in the app's ISO 8601 UTC format.
INSERT INTO `categories` (`id`, `name`, `is_default`, `active`, `created_at`, `updated_at`) VALUES
	('5b0c3c1e-8f0e-4c55-9d1a-0c6f2f8a0001', 'Rokok', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('5b0c3c1e-8f0e-4c55-9d1a-0c6f2f8a0002', 'Sembako', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('5b0c3c1e-8f0e-4c55-9d1a-0c6f2f8a0003', 'Lain-lain', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
