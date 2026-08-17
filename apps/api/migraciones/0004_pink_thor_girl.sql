CREATE TABLE `movimientos_prestamo` (
	`id` text PRIMARY KEY NOT NULL,
	`empleado_id` text NOT NULL,
	`fecha` text NOT NULL,
	`tipo` text NOT NULL,
	`monto` integer NOT NULL,
	`saldo_anterior` integer NOT NULL,
	`saldo_nuevo` integer NOT NULL,
	`concepto` text,
	`liquidacion_id` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`liquidacion_id`) REFERENCES `liquidaciones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_movimientos_prestamo_empleado_fecha` ON `movimientos_prestamo` (`empleado_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `idx_movimientos_prestamo_liquidacion` ON `movimientos_prestamo` (`liquidacion_id`);--> statement-breakpoint
CREATE TABLE `prestamos_empleado` (
	`id` text PRIMARY KEY NOT NULL,
	`empleado_id` text NOT NULL,
	`saldo_actual` integer DEFAULT 0 NOT NULL,
	`actualizado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prestamos_empleado_empleado_id_unique` ON `prestamos_empleado` (`empleado_id`);