ALTER TABLE gestiones_cobro ADD COLUMN seguimiento_cerrado_en text;
--> statement-breakpoint
ALTER TABLE gestiones_cobro ADD COLUMN seguimiento_cerrado_por text;
--> statement-breakpoint
CREATE INDEX idx_gestiones_seguimiento ON gestiones_cobro (seguimiento_cerrado_en, fecha_proxima_accion);
--> statement-breakpoint
CREATE INDEX idx_gestiones_cliente_fecha ON gestiones_cobro (cartera_cliente_id, fecha_gestion);
