CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`product_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`product_code` text NOT NULL,
	`product_name` text NOT NULL,
	`unit_name` text NOT NULL,
	`qty_base` integer NOT NULL,
	`unit_factor` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`cost_price` integer NOT NULL,
	`pricing_factor` integer NOT NULL,
	`subtotal` integer NOT NULL,
	`cost_total` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `product_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sale_items_sale_id_idx` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_items_product_id_idx` ON `sale_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `sale_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sale_payments_sale_id_idx` ON `sale_payments` (`sale_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text,
	`cashier_id` text NOT NULL,
	`status` text NOT NULL,
	`total` integer NOT NULL,
	`rounding_amount` integer NOT NULL,
	`paid_total` integer DEFAULT 0 NOT NULL,
	`change_amount` integer DEFAULT 0 NOT NULL,
	`debt_amount` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	`receipt_count` integer DEFAULT 0 NOT NULL,
	`receipt_file` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_number_unique` ON `sales` (`number`);--> statement-breakpoint
CREATE INDEX `sales_status_created_at_idx` ON `sales` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `sales_completed_at_idx` ON `sales` (`completed_at`);