# Sistema de Clasificación y Grupos de Gestión - CRM Cobranza

## 📋 Resumen

Se implementó un sistema completo de clasificación y gestión de cartera que permite:

1. **Etiquetar clientes** con categorías personalizables (Moroso, Acuerdo de pago, Cambió ubicación, etc.)
2. **Crear grupos/listas de gestión** para organizar campañas de cobranza
3. **Seguimiento visual del progreso** de cada grupo con sistema tipo Kanban
4. **Marcar clientes como gestionados** dentro de cada grupo con resultado y notas

---

## 🏷️ Sistema de Etiquetas

### Etiquetas Predefinidas del Sistema

1. **🔴 Moroso** - Cliente con mora significativa
2. **🤝 Acuerdo de Pago** - Cliente con acuerdo de pago establecido
3. **📍 Cambió Ubicación** - Cliente que cambió de dirección o teléfono
4. **💰 Promesa de Pago** - Cliente prometió pagar en fecha específica
5. **📵 Difícil Contacto** - Cliente difícil de contactar
6. **⚖️ Proceso Jurídico** - Cliente en proceso legal
7. **⭐ Buen Pagador** - Cliente cumplido con sus pagos
8. **🔄 Por Refinanciar** - Cliente requiere refinanciación

### Características

- **Múltiples etiquetas por cliente**: Un cliente puede tener varias etiquetas simultáneamente
- **Colores personalizados**: Cada etiqueta tiene un color para identificación visual rápida
- **Iconos emoji**: Facilitan la identificación visual
- **Etiquetas personalizadas**: Los usuarios pueden crear sus propias etiquetas
- **Historial de asignación**: Se registra quién asignó cada etiqueta y cuándo

---

## 📊 Grupos de Gestión

### ¿Qué es un Grupo de Gestión?

Un grupo es una lista organizada de clientes que necesitas gestionar en una campaña específica. Por ejemplo:
- "Morosos Agosto 2026"
- "Clientes con promesa de pago"
- "Seguimiento semanal"
- "Refinanciaciones pendientes"

### Características de los Grupos

1. **Estado del grupo**: 
   - Activo
   - En progreso
   - Completado
   - Archivado

2. **Progreso visual**:
   - Total de clientes
   - Clientes gestionados
   - Clientes pendientes
   - Barra de progreso con porcentaje

3. **Fechas importantes**:
   - Fecha de inicio
   - Fecha objetivo
   - Fecha de completado

4. **Color personalizado**: Cada grupo tiene un color para identificación rápida

---

## 🎯 Flujo de Trabajo

### 1. Crear un Grupo de Gestión

1. Ir a `/crm/grupos`
2. Clic en "Crear Grupo"
3. Ingresar:
   - Nombre (ej: "Morosos Agosto")
   - Descripción
   - Color de identificación
   - Fecha objetivo (opcional)

### 2. Agregar Clientes al Grupo

1. Entrar al grupo
2. Clic en "Agregar Clientes"
3. Buscar clientes por nombre, cédula o número
4. Seleccionar los clientes deseados
5. Clic en "Agregar"

### 3. Gestionar Clientes

Para cada cliente en el grupo:
1. Ver información completa (saldo, mora, teléfono)
2. Acciones disponibles:
   - Ver detalle completo
   - Llamar directamente (si tiene teléfono)
   - Marcar como gestionado

### 4. Registrar Gestión

Al marcar un cliente como gestionado:
1. Seleccionar resultado:
   - Contactado exitosamente
   - Promesa de pago
   - No contesta
   - Número errado
   - Acuerdo establecido
   - Negativa de pago
2. Agregar notas sobre la gestión
3. Guardar

### 5. Seguimiento del Progreso

- Vista en tiempo real del progreso del grupo
- Clientes pendientes vs. gestionados
- Historial de gestiones en clientes completados

---

## 🗂️ Estructura de Base de Datos

### Tablas Creadas

1. **etiquetas_cartera**: Catálogo de etiquetas
2. **cliente_etiquetas**: Relación cliente-etiquetas (muchos a muchos)
3. **grupos_gestion**: Grupos/listas de gestión
4. **clientes_grupo**: Clientes asignados a grupos con estado de gestión

---

## 🚀 Endpoints de la API

### Etiquetas

- `GET /api/admin/crm/etiquetas` - Listar etiquetas
- `POST /api/admin/crm/etiquetas` - Crear etiqueta personalizada
- `GET /api/admin/crm/clientes/:clienteId/etiquetas` - Etiquetas de un cliente
- `POST /api/admin/crm/clientes/:clienteId/etiquetas` - Asignar etiquetas
- `DELETE /api/admin/crm/clientes/:clienteId/etiquetas/:etiquetaId` - Remover etiqueta

### Grupos

- `GET /api/admin/crm/grupos` - Listar grupos
- `POST /api/admin/crm/grupos` - Crear grupo
- `GET /api/admin/crm/grupos/:grupoId` - Detalle de grupo con clientes
- `PATCH /api/admin/crm/grupos/:grupoId` - Actualizar grupo
- `POST /api/admin/crm/grupos/:grupoId/clientes` - Agregar clientes al grupo
- `PATCH /api/admin/crm/grupos/:grupoId/clientes/:clienteGrupoId` - Marcar cliente como gestionado

---

## 📱 Páginas del Frontend

### 1. Vista de Grupos (`/crm/grupos`)
- Muestra todos los grupos en tarjetas tipo Kanban
- Cada tarjeta muestra:
  - Nombre y descripción
  - Barra de progreso
  - Estado (activo, completado, etc.)
  - Fecha objetivo
  - Creador del grupo

### 2. Detalle de Grupo (`/crm/grupos/:grupoId`)
- Lista de clientes pendientes de gestionar
- Lista de clientes ya gestionados
- Acciones rápidas (llamar, ver detalle)
- Modal para registrar gestión
- Búsqueda para agregar más clientes

### 3. Componente de Etiquetas (`GestorEtiquetas`)
- Se puede integrar en cualquier vista de cliente
- Muestra etiquetas asignadas
- Permite agregar/remover etiquetas
- Dropdown con etiquetas disponibles

---

## 💡 Casos de Uso

### Caso 1: Campaña de Morosos
1. Crear grupo "Morosos Agosto 2026"
2. Filtrar en cartera clientes con +30 días de mora
3. Agregarlos al grupo
4. Ir gestionando uno por uno
5. Marcar resultado de cada gestión
6. Ver progreso en tiempo real

### Caso 2: Seguimiento de Acuerdos
1. Cuando un cliente hace acuerdo de pago, asignarle etiqueta "🤝 Acuerdo de Pago"
2. Crear grupo "Seguimiento Acuerdos Septiembre"
3. Agregar todos los clientes con esa etiqueta
4. Hacer seguimiento diario/semanal
5. Actualizar estado según cumplimiento

### Caso 3: Clientes Difíciles de Contactar
1. Identificar clientes con múltiples intentos fallidos
2. Asignarles etiqueta "📵 Difícil Contacto"
3. Crear grupo especial para estos casos
4. Intentar contacto en diferentes horarios
5. Registrar cada intento

---

## 🎨 Ventajas del Sistema

1. **Organización visual**: Como un tablero Kanban, sabes exactamente qué falta por hacer
2. **No se pierde ningún cliente**: Lista clara de quién falta gestionar
3. **Medición de productividad**: Sabes cuántos clientes gestionaste por día
4. **Clasificación flexible**: Las etiquetas permiten categorizar sin límites
5. **Historial completo**: Cada gestión queda registrada con resultado y notas
6. **Trabajo en equipo**: Varios usuarios pueden trabajar en diferentes grupos
7. **Metas claras**: Fecha objetivo y progreso visible motivan a completar

---

## 🔧 Archivos Modificados/Creados

### Backend
- `apps/api/src/db/esquema/crm-etiquetas.ts` - Esquema de etiquetas y grupos
- `apps/api/src/rutas/crm-etiquetas.ts` - Endpoints de etiquetas y grupos
- `apps/api/migraciones/0007_etiquetas_grupos.sql` - Migración de base de datos
- `apps/api/src/rutas/crm.ts` - Integración de rutas

### Frontend
- `apps/web/src/paginas/CrmGruposGestion.tsx` - Vista principal de grupos
- `apps/web/src/paginas/CrmGrupoDetalle.tsx` - Detalle y gestión de grupo
- `apps/web/src/componentes/GestorEtiquetas.tsx` - Componente de etiquetas
- `apps/web/src/App.tsx` - Rutas del frontend

### Scripts
- `apps/api/src/db/aplicar-migracion-etiquetas.ts` - Script para aplicar migración

---

## 📝 Próximos Pasos Sugeridos

1. **Integrar GestorEtiquetas en la vista de cartera**: Para que desde la tabla principal puedas asignar etiquetas rápidamente
2. **Filtrar cartera por etiquetas**: Agregar filtro de etiquetas en la vista de cartera
3. **Dashboard de grupos**: Vista resumen con todos los grupos activos
4. **Notificaciones**: Alertar cuando se acerca la fecha objetivo de un grupo
5. **Exportar resultados**: Exportar a Excel el resultado de una campaña/grupo
6. **Plantillas de grupos**: Crear grupos predefinidos para casos comunes

---

## ✅ Estado Actual

- ✅ Base de datos creada y migración aplicada
- ✅ API completa con todos los endpoints
- ✅ Frontend con vistas principales
- ✅ 8 etiquetas predefinidas del sistema
- ⚠️ Pendiente: Integrar componente de etiquetas en vistas existentes
- ⚠️ Pendiente: Agregar enlace en menú lateral

**El sistema está funcional y listo para usar. Solo falta integrarlo visualmente en las vistas existentes.**
