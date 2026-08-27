CREATE TABLE `devoluciones_venta` (
	`id` text PRIMARY KEY NOT NULL,
	`empleado_id` text NOT NULL,
	`municipio_id` text,
	`fecha` text NOT NULL,
	`cantidad` integer NOT NULL,
	`tarifa_venta` integer NOT NULL,
	`motivo` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`municipio_id`) REFERENCES `municipios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_devoluciones_empleado_fecha` ON `devoluciones_venta` (`empleado_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `idx_devoluciones_fecha` ON `devoluciones_venta` (`fecha`);