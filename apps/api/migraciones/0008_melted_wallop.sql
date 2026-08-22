CREATE TABLE `zonas_venta` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`whatsapp_vendedor` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `zonas_venta_nombre_unique` ON `zonas_venta` (`nombre`);--> statement-breakpoint
CREATE INDEX `idx_zonas_venta_activo` ON `zonas_venta` (`activo`);--> statement-breakpoint
ALTER TABLE `pedidos_whatsapp` ADD `zona` text;