ALTER TABLE `product_units` ADD `parent_unit_id` text REFERENCES product_units(id);--> statement-breakpoint
ALTER TABLE `product_units` ADD `level` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_units` ADD `isi` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_units` ADD `cost_price` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `product_units_parent_unit_id_idx` ON `product_units` (`parent_unit_id`);--> statement-breakpoint
-- Pre-MS1 rows stay flat: `isi` keeps the old factor to the stock unit (docs/design.md 4.1.1).
UPDATE `product_units` SET `isi` = `factor`;--> statement-breakpoint
-- Cost of one of this unit, from the product cost per `pricing_factor` base units (half up).
UPDATE `product_units` SET `cost_price` = (
  SELECT (`product_units`.`factor` * p.`cost_price` + p.`pricing_factor` / 2) / p.`pricing_factor`
  FROM `products` p WHERE p.`id` = `product_units`.`product_id`
);--> statement-breakpoint
-- `level` orders the rows: the others by factor descending, then the primary unit deepest.
UPDATE `product_units` SET `level` = 1 + (
  SELECT COUNT(*) FROM `product_units` o
  WHERE o.`product_id` = `product_units`.`product_id`
    AND (o.`is_base` < `product_units`.`is_base`
      OR (o.`is_base` = `product_units`.`is_base`
        AND (o.`factor` > `product_units`.`factor`
          OR (o.`factor` = `product_units`.`factor` AND o.`id` < `product_units`.`id`))))
);
