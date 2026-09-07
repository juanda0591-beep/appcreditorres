CREATE TABLE conversaciones_cobranza (
 id text PRIMARY KEY NOT NULL, jid text NOT NULL UNIQUE, telefono text, nombre text, documento text,
 pausada integer NOT NULL DEFAULT 0, requiere_asesor integer NOT NULL DEFAULT 0,
 ultimo_mensaje text NOT NULL DEFAULT '', actualizado_en text NOT NULL
);
--> statement-breakpoint
CREATE TABLE mensajes_cobranza (
 id text PRIMARY KEY NOT NULL, conversacion_id text NOT NULL REFERENCES conversaciones_cobranza(id) ON DELETE CASCADE,
 externo_id text, rol text NOT NULL, contenido text NOT NULL, estado text NOT NULL DEFAULT 'recibido', creado_en text NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_mensajes_cobranza_conversacion ON mensajes_cobranza(conversacion_id, creado_en);
--> statement-breakpoint
CREATE UNIQUE INDEX uq_mensajes_cobranza_externo ON mensajes_cobranza(conversacion_id, externo_id);
