-- Migration: Add badge fields to products
ALTER TABLE `productos` ADD `es_nuevo` integer DEFAULT 0 NOT NULL;
ALTER TABLE `productos` ADD `en_promocion` integer DEFAULT 0 NOT NULL;
