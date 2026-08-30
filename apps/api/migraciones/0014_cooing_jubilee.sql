CREATE TABLE `plantillas_cobranza` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`categoria` text NOT NULL,
	`cuerpo` text NOT NULL,
	`activa` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL
);
