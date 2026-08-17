CREATE TABLE `sesiones` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` text NOT NULL,
	`expira_en` text NOT NULL,
	`ip` text,
	`navegador` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sesiones_usuario` ON `sesiones` (`usuario_id`);--> statement-breakpoint
CREATE INDEX `idx_sesiones_expira` ON `sesiones` (`expira_en`);--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario` text NOT NULL,
	`contrasena_hash` text NOT NULL,
	`nombre` text NOT NULL,
	`rol` text DEFAULT 'admin' NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`ultimo_acceso` text,
	`creado_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_usuario_unique` ON `usuarios` (`usuario`);--> statement-breakpoint
CREATE INDEX `idx_usuarios_activo` ON `usuarios` (`activo`);