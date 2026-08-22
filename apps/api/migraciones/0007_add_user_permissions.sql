-- Agregar sistema de permisos granulares a usuarios

-- Agregar campo para permisos personalizados (JSON)
ALTER TABLE usuarios ADD COLUMN permisos TEXT;
--> statement-breakpoint
-- Agregar campo para vincular usuario con empleado
ALTER TABLE usuarios ADD COLUMN empleado_id TEXT;
--> statement-breakpoint
-- Crear índice para búsquedas por empleado
CREATE INDEX IF NOT EXISTS idx_usuarios_empleado ON usuarios(empleado_id);
--> statement-breakpoint
-- Actualizar usuarios existentes: admin mantiene todos los permisos
UPDATE usuarios SET permisos = '{"dashboard":true,"empleados":true,"municipios":true,"ventas":true,"cobros":true,"gastos":true,"liquidaciones":true,"caja":true,"prestamos":true,"catalogo":true,"configuracion":true,"usuarios":true}' WHERE rol = 'admin';
--> statement-breakpoint
-- Actualizar usuarios con rol 'catalogo': solo acceso a catálogo y configuración de catálogo
UPDATE usuarios SET permisos = '{"dashboard":false,"empleados":false,"municipios":false,"ventas":false,"cobros":false,"gastos":false,"liquidaciones":false,"caja":false,"prestamos":false,"catalogo":true,"configuracion":true,"usuarios":false}' WHERE rol = 'catalogo';
