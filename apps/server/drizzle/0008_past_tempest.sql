-- SQLite cannot add a NOT NULL column without a default. The '' default only lets the column be
-- added: existing rows are backfilled below and every new sale line sets both values.
ALTER TABLE `sale_items` ADD `category_id` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `sale_items` ADD `category_name` text NOT NULL DEFAULT '';--> statement-breakpoint
-- Lines sold before this migration take the product's category at migration time.
UPDATE `sale_items` SET
  `category_id` = (SELECT p.`category_id` FROM `products` p WHERE p.`id` = `sale_items`.`product_id`),
  `category_name` = (SELECT c.`name` FROM `products` p JOIN `categories` c ON c.`id` = p.`category_id` WHERE p.`id` = `sale_items`.`product_id`);--> statement-breakpoint
CREATE INDEX `sale_items_category_id_idx` ON `sale_items` (`category_id`);
