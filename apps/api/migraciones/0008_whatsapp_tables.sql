-- Crear tablas para el sistema de WhatsApp

CREATE TABLE `campanas_whatsapp` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`mensaje` text NOT NULL,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`destinatarios` text NOT NULL,
	`productos_relacionados` text,
	`enviados_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`programada_para` text,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversaciones_whatsapp` (
	`id` text PRIMARY KEY NOT NULL,
	`telefono` text NOT NULL,
	`nombre_cliente` text,
	`estado` text DEFAULT 'activa' NOT NULL,
	`ultimo_mensaje` text,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mensajes_whatsapp` (
	`id` text PRIMARY KEY NOT NULL,
	`conversacion_id` text NOT NULL,
	`rol` text NOT NULL,
	`contenido` text NOT NULL,
	`metadata` text,
	`creado_en` text NOT NULL,
	FOREIGN KEY (`conversacion_id`) REFERENCES `conversaciones_whatsapp`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pedidos_whatsapp` (
	`id` text PRIMARY KEY NOT NULL,
	`conversacion_id` text NOT NULL,
	`telefono` text NOT NULL,
	`nombre_cliente` text NOT NULL,
	`direccion` text,
	`productos` text NOT NULL,
	`total` integer NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`notas` text,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL,
	FOREIGN KEY (`conversacion_id`) REFERENCES `conversaciones_whatsapp`(`id`) ON UPDATE no action ON DELETE no action
);
