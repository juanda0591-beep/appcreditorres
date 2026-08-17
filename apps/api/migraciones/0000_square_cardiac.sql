CREATE TABLE `empleados` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`documento` text,
	`telefono` text,
	`tarifa_venta` integer DEFAULT 6000 NOT NULL,
	`tarifa_liquidacion` integer DEFAULT 5000 NOT NULL,
	`porcentaje_cobro` real DEFAULT 10 NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_empleados_activo` ON `empleados` (`activo`);--> statement-breakpoint
CREATE TABLE `municipios` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`meta_recaudo` integer NOT NULL,
	`porcentaje_excedente` real DEFAULT 0 NOT NULL,
	`base_bono` text DEFAULT 'excedente' NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `municipios_nombre_unique` ON `municipios` (`nombre`);--> statement-breakpoint
CREATE INDEX `idx_municipios_activo` ON `municipios` (`activo`);--> statement-breakpoint
CREATE TABLE `gastos_empleado` (
	`id` text PRIMARY KEY NOT NULL,
	`empleado_id` text NOT NULL,
	`municipio_id` text,
	`fecha` text NOT NULL,
	`monto` integer NOT NULL,
	`concepto` text NOT NULL,
	`deducible` integer DEFAULT true NOT NULL,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`municipio_id`) REFERENCES `municipios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_gastos_empleado_fecha` ON `gastos_empleado` (`empleado_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `registros_cobro` (
	`id` text PRIMARY KEY NOT NULL,
	`empleado_id` text NOT NULL,
	`municipio_id` text NOT NULL,
	`fecha` text NOT NULL,
	`monto_recaudado` integer NOT NULL,
	`porcentaje_aplicado` real NOT NULL,
	`nota` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`municipio_id`) REFERENCES `municipios`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_cobros_empleado_fecha` ON `registros_cobro` (`empleado_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `idx_cobros_municipio_fecha` ON `registros_cobro` (`municipio_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `registros_venta` (
	`id` text PRIMARY KEY NOT NULL,
	`empleado_id` text NOT NULL,
	`municipio_id` text,
	`fecha` text NOT NULL,
	`cantidad` integer NOT NULL,
	`tarifa_venta` integer NOT NULL,
	`tarifa_liquidacion` integer NOT NULL,
	`nota` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`municipio_id`) REFERENCES `municipios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ventas_empleado_fecha` ON `registros_venta` (`empleado_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `idx_ventas_fecha` ON `registros_venta` (`fecha`);--> statement-breakpoint
CREATE TABLE `liquidaciones` (
	`id` text PRIMARY KEY NOT NULL,
	`empleado_id` text NOT NULL,
	`periodo_desde` text NOT NULL,
	`periodo_hasta` text NOT NULL,
	`ventas_cantidad` integer DEFAULT 0 NOT NULL,
	`ventas_devengado` integer DEFAULT 0 NOT NULL,
	`ventas_liquidado` integer DEFAULT 0 NOT NULL,
	`cobros_recaudado` integer DEFAULT 0 NOT NULL,
	`cobros_comision` integer DEFAULT 0 NOT NULL,
	`bonos_total` integer DEFAULT 0 NOT NULL,
	`deducciones_total` integer DEFAULT 0 NOT NULL,
	`total_bruto` integer NOT NULL,
	`neto_a_pagar` integer NOT NULL,
	`ahorro_retenido` integer DEFAULT 0 NOT NULL,
	`incluyo_bonos` integer DEFAULT false NOT NULL,
	`detalle_bonos` text,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`pagada_en` text,
	`nota` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_liquidaciones_empleado` ON `liquidaciones` (`empleado_id`,`periodo_desde`);--> statement-breakpoint
CREATE INDEX `idx_liquidaciones_estado` ON `liquidaciones` (`estado`);--> statement-breakpoint
CREATE TABLE `movimientos_ahorro` (
	`id` text PRIMARY KEY NOT NULL,
	`empleado_id` text NOT NULL,
	`fecha` text NOT NULL,
	`tipo` text NOT NULL,
	`monto` integer NOT NULL,
	`referencia_id` text,
	`nota` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_ahorro_empleado_fecha` ON `movimientos_ahorro` (`empleado_id`,`fecha`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ahorro_referencia` ON `movimientos_ahorro` (`referencia_id`,`tipo`);--> statement-breakpoint
CREATE TABLE `movimientos_caja` (
	`id` text PRIMARY KEY NOT NULL,
	`fecha` text NOT NULL,
	`tipo` text NOT NULL,
	`monto` integer NOT NULL,
	`categoria` text NOT NULL,
	`concepto` text NOT NULL,
	`empleado_id` text,
	`origen` text,
	`referencia_id` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_caja_fecha` ON `movimientos_caja` (`fecha`);--> statement-breakpoint
CREATE INDEX `idx_caja_tipo_fecha` ON `movimientos_caja` (`tipo`,`fecha`);--> statement-breakpoint
CREATE INDEX `idx_caja_categoria` ON `movimientos_caja` (`categoria`);--> statement-breakpoint
CREATE TABLE `productos` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`precio` integer NOT NULL,
	`categoria` text,
	`imagen_url` text,
	`visible` integer DEFAULT true NOT NULL,
	`disponible` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_productos_visible_orden` ON `productos` (`visible`,`orden`);--> statement-breakpoint
CREATE INDEX `idx_productos_categoria` ON `productos` (`categoria`);