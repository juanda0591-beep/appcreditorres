-- Migration: Agregar sistema de etiquetas y grupos de gestión
-- Created: 2026-08-31

-- Tabla de etiquetas para clasificar clientes
CREATE TABLE IF NOT EXISTS etiquetas_cartera (
  id TEXT PRIMARY KEY NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL,
  icono TEXT,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  sistema INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

-- Relación cliente-etiquetas (muchos a muchos)
CREATE TABLE IF NOT EXISTS cliente_etiquetas (
  id TEXT PRIMARY KEY NOT NULL,
  cartera_cliente_id TEXT NOT NULL,
  etiqueta_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  nombre_usuario TEXT NOT NULL,
  notas TEXT,
  creado_en TEXT NOT NULL,
  FOREIGN KEY (cartera_cliente_id) REFERENCES cartera_clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (etiqueta_id) REFERENCES etiquetas_cartera(id) ON DELETE CASCADE
);

-- Grupos/Listas de gestión
CREATE TABLE IF NOT EXISTS grupos_gestion (
  id TEXT PRIMARY KEY NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  color TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo',
  total_clientes INTEGER NOT NULL DEFAULT 0,
  clientes_gestionados INTEGER NOT NULL DEFAULT 0,
  fecha_inicio TEXT,
  fecha_objetivo TEXT,
  fecha_completado TEXT,
  creado_por_id TEXT NOT NULL,
  creado_por_nombre TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

-- Clientes en grupos de gestión
CREATE TABLE IF NOT EXISTS clientes_grupo (
  id TEXT PRIMARY KEY NOT NULL,
  grupo_id TEXT NOT NULL,
  cartera_cliente_id TEXT NOT NULL,
  gestionado INTEGER NOT NULL DEFAULT 0,
  fecha_gestion TEXT,
  resultado TEXT,
  notas TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  FOREIGN KEY (grupo_id) REFERENCES grupos_gestion(id) ON DELETE CASCADE,
  FOREIGN KEY (cartera_cliente_id) REFERENCES cartera_clientes(id) ON DELETE CASCADE
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_cliente_etiquetas_cliente ON cliente_etiquetas(cartera_cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_etiquetas_etiqueta ON cliente_etiquetas(etiqueta_id);
CREATE INDEX IF NOT EXISTS idx_clientes_grupo_grupo ON clientes_grupo(grupo_id);
CREATE INDEX IF NOT EXISTS idx_clientes_grupo_cliente ON clientes_grupo(cartera_cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_grupo_gestionado ON clientes_grupo(gestionado);

-- Insertar etiquetas del sistema predefinidas
INSERT INTO etiquetas_cartera (id, nombre, color, icono, descripcion, orden, sistema, activa, creado_en, actualizado_en)
VALUES
  ('etiq-moroso', 'Moroso', '#ef4444', '🔴', 'Cliente con mora significativa', 1, 1, 1, datetime('now'), datetime('now')),
  ('etiq-acuerdo', 'Acuerdo de Pago', '#3b82f6', '🤝', 'Cliente con acuerdo de pago establecido', 2, 1, 1, datetime('now'), datetime('now')),
  ('etiq-ubicacion', 'Cambió Ubicación', '#f59e0b', '📍', 'Cliente que cambió de dirección o teléfono', 3, 1, 1, datetime('now'), datetime('now')),
  ('etiq-promesa', 'Promesa de Pago', '#10b981', '💰', 'Cliente prometió pagar en fecha específica', 4, 1, 1, datetime('now'), datetime('now')),
  ('etiq-dificil', 'Difícil Contacto', '#6366f1', '📵', 'Cliente difícil de contactar', 5, 1, 1, datetime('now'), datetime('now')),
  ('etiq-juridico', 'Proceso Jurídico', '#dc2626', '⚖️', 'Cliente en proceso legal', 6, 1, 1, datetime('now'), datetime('now')),
  ('etiq-cumplidor', 'Buen Pagador', '#059669', '⭐', 'Cliente cumplido con sus pagos', 7, 1, 1, datetime('now'), datetime('now')),
  ('etiq-refinanciar', 'Por Refinanciar', '#8b5cf6', '🔄', 'Cliente requiere refinanciación', 8, 1, 1, datetime('now'), datetime('now'));
