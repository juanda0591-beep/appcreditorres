ALTER TABLE `productos` ADD `precio_contado` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `productos` ADD `precio_credicontado` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `productos` ADD `precio_credito` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `productos` ADD `inicial` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `productos` ADD `pago_semanal` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `productos` ADD `imagenes` text;
