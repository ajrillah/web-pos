CREATE TABLE `customer_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`customer_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`amount_received` integer NOT NULL,
	`change_amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`voided_at` text,
	`voided_by` text,
	`receipt_count` integer DEFAULT 0 NOT NULL,
	`receipt_file` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_payments_number_unique` ON `customer_payments` (`number`);--> statement-breakpoint
CREATE INDEX `customer_payments_customer_idx` ON `customer_payments` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`note` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`receivable_id` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `customer_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receivable_id`) REFERENCES `receivables`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_allocations_payment_idx` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payment_allocations_receivable_idx` ON `payment_allocations` (`receivable_id`);--> statement-breakpoint
CREATE TABLE `receivables` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`amount` integer NOT NULL,
	`remaining` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receivables_sale_id_unique` ON `receivables` (`sale_id`);--> statement-breakpoint
CREATE INDEX `receivables_customer_status_idx` ON `receivables` (`customer_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `sales` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
ALTER TABLE `sales` ADD `customer_balance_after` integer;