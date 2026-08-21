CREATE TABLE `suscripciones_push` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL
);
