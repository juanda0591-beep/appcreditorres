ALTER TABLE cartera_clientes ADD COLUMN fecha_corte_excel text;
--> statement-breakpoint
ALTER TABLE cartera_clientes ADD COLUMN fecha_corte_abono text;
--> statement-breakpoint
ALTER TABLE cartera_clientes ADD COLUMN ultima_importacion_en text;
--> statement-breakpoint
CREATE INDEX idx_cartera_documento ON cartera_clientes (upper(replace(replace(replace(trim(cedula), '.', ''), ' ', ''), '-', '')));
--> statement-breakpoint
CREATE TABLE contactos_crm (
  documento text PRIMARY KEY NOT NULL, version integer NOT NULL DEFAULT 1, responsable_id text,
  estado_ubicacion text NOT NULL DEFAULT 'por_confirmar',
  direccion_anterior text NOT NULL DEFAULT '', direccion_actual text NOT NULL DEFAULT '',
  barrio text NOT NULL DEFAULT '', municipio text NOT NULL DEFAULT '', referencias text NOT NULL DEFAULT '',
  telefono_alternativo text NOT NULL DEFAULT '', verificado_en text, actualizado_en text NOT NULL
);
--> statement-breakpoint
CREATE TABLE cambios_contacto_crm (
  id text PRIMARY KEY NOT NULL, documento text NOT NULL, anterior text, nuevo text NOT NULL,
  usuario_id text NOT NULL, nombre_usuario text NOT NULL, creado_en text NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_contacto_cambios_documento ON cambios_contacto_crm(documento, creado_en);
--> statement-breakpoint
CREATE TABLE promesas_crm (
  id text PRIMARY KEY NOT NULL, cartera_cliente_id text NOT NULL REFERENCES cartera_clientes(id) ON DELETE CASCADE,
  gestion_id text REFERENCES gestiones_cobro(id) ON DELETE SET NULL,
  monto real NOT NULL CHECK(monto > 0), fecha_compromiso text NOT NULL, estado text NOT NULL DEFAULT 'pendiente',
  abono_base real NOT NULL, responsable_id text NOT NULL, responsable_nombre text NOT NULL,
  notas text NOT NULL DEFAULT '', resolucion text, resuelta_en text, creado_en text NOT NULL, actualizado_en text NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_promesas_estado_fecha ON promesas_crm(estado, fecha_compromiso);
--> statement-breakpoint
CREATE UNIQUE INDEX uq_promesa_abierta_credito ON promesas_crm(cartera_cliente_id) WHERE estado IN ('pendiente', 'parcial');
--> statement-breakpoint
CREATE TABLE importaciones_crm (
  id text PRIMARY KEY NOT NULL, archivo text NOT NULL, fecha_corte text NOT NULL, usuario_id text NOT NULL,
  nuevos integer NOT NULL DEFAULT 0, actualizados integer NOT NULL DEFAULT 0, sin_cambios integer NOT NULL DEFAULT 0,
  errores integer NOT NULL DEFAULT 0, comparados integer NOT NULL DEFAULT 0,
  saldo_anterior real NOT NULL DEFAULT 0, saldo_nuevo real NOT NULL DEFAULT 0,
  abono_anterior real NOT NULL DEFAULT 0, abono_nuevo real NOT NULL DEFAULT 0, finalizada_en text, creado_en text NOT NULL
);
