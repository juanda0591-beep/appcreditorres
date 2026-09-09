ALTER TABLE conversaciones_whatsapp ADD COLUMN modo_atencion text NOT NULL DEFAULT 'automatico';
--> statement-breakpoint
ALTER TABLE conversaciones_whatsapp ADD COLUMN revision_atencion integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE conversaciones_whatsapp ADD COLUMN jid text;
--> statement-breakpoint
ALTER TABLE conversaciones_whatsapp ADD COLUMN transporte text NOT NULL DEFAULT 'baileys';
--> statement-breakpoint
ALTER TABLE conversaciones_whatsapp ADD COLUMN borrador_pedido text;
--> statement-breakpoint
CREATE TABLE ajustes_ventas (id text PRIMARY KEY NOT NULL DEFAULT 'principal', modo text NOT NULL DEFAULT 'automatico', revision integer NOT NULL DEFAULT 0);
--> statement-breakpoint
INSERT INTO ajustes_ventas(id, modo, revision) VALUES ('principal', 'automatico', 0);
