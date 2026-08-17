CREATE TABLE `configuracion` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`nombre_negocio` text DEFAULT 'Mi negocio' NOT NULL,
	`whatsapp_numero` text,
	`titulo_catalogo` text DEFAULT 'Catalogo de productos' NOT NULL,
	`descripcion_catalogo` text,
	`plantilla_mensaje` text DEFAULT 'Hola! Te comparto nuestro catalogo: {{titulo}}
{{link}}' NOT NULL,
	`plantilla_consulta` text DEFAULT 'Hola! Me interesa {{producto}} ({{precio}}). Me das mas informacion?' NOT NULL,
	`nota_pie` text,
	`catalogo_activo` integer DEFAULT true NOT NULL,
	`mostrar_precios` integer DEFAULT true NOT NULL,
	`actualizado_en` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `productos` ADD `miniatura_url` text;