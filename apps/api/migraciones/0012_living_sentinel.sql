CREATE TABLE `analisis_cartera_ia` (
	`id` text PRIMARY KEY NOT NULL,
	`cartera_cliente_id` text NOT NULL,
	`probabilidad_pago` real,
	`riesgo_morosidad` text,
	`accion_sugerida` text,
	`razonamiento` text,
	`modelo_utilizado` text NOT NULL,
	`confianza` real,
	`fecha_analisis` text NOT NULL,
	`vigencia_hasta` text,
	FOREIGN KEY (`cartera_cliente_id`) REFERENCES `cartera_clientes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cartera_cambios` (
	`id` text PRIMARY KEY NOT NULL,
	`cartera_cliente_id` text NOT NULL,
	`tipo_operacion` text NOT NULL,
	`campo_modificado` text,
	`valor_anterior` text,
	`valor_nuevo` text,
	`archivo_origen` text,
	`fecha_cambio` text NOT NULL,
	`usuario_id` text NOT NULL,
	FOREIGN KEY (`cartera_cliente_id`) REFERENCES `cartera_clientes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cartera_clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`numero` text NOT NULL,
	`vendedor` text NOT NULL,
	`cliente` text NOT NULL,
	`cedula` text NOT NULL,
	`telefono` text,
	`municipio` text,
	`articulo` text NOT NULL,
	`fecha_inicio` text NOT NULL,
	`monto_cuota` real NOT NULL,
	`periodos_pago` text NOT NULL,
	`abono` real DEFAULT 0 NOT NULL,
	`saldo` real NOT NULL,
	`ultima_fecha_abono` text,
	`estado` text DEFAULT 'activo' NOT NULL,
	`dias_mora` integer DEFAULT 0,
	`metadata` text,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cartera_clientes_numero_unique` ON `cartera_clientes` (`numero`);--> statement-breakpoint
CREATE TABLE `gestiones_cobro` (
	`id` text PRIMARY KEY NOT NULL,
	`cartera_cliente_id` text NOT NULL,
	`fecha_gestion` text NOT NULL,
	`tipo_gestion` text NOT NULL,
	`canal` text NOT NULL,
	`resultado` text NOT NULL,
	`notas` text,
	`proxima_accion` text,
	`fecha_proxima_accion` text,
	`usuario_id` text NOT NULL,
	`nombre_usuario` text NOT NULL,
	`sentimiento_ia` text,
	`prioridad_ia` integer,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`cartera_cliente_id`) REFERENCES `cartera_clientes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pagos_cartera` (
	`id` text PRIMARY KEY NOT NULL,
	`cartera_cliente_id` text NOT NULL,
	`fecha_pago` text NOT NULL,
	`monto` real NOT NULL,
	`metodo_pago` text NOT NULL,
	`referencia` text,
	`usuario_id` text NOT NULL,
	`nombre_usuario` text NOT NULL,
	`notas` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`cartera_cliente_id`) REFERENCES `cartera_clientes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reglas_cobranza` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`activa` integer DEFAULT true NOT NULL,
	`condiciones` text NOT NULL,
	`tipo_accion` text NOT NULL,
	`parametros_accion` text NOT NULL,
	`prioridad` integer DEFAULT 1 NOT NULL,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL
);
