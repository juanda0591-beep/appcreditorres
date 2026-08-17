# App Creditorres - Sistema de Ventas a Crédito con WhatsApp

Sistema completo de gestión de ventas a crédito con integración de WhatsApp Business, catálogo de productos, gestión de clientes y campañas automatizadas.

## 🚀 Características

### WhatsApp Business
- ✅ Agente de ventas IA con OpenAI
- ✅ Respuestas personalizadas y contextuales
- ✅ Detección automática de intención de compra
- ✅ Recopilación de datos del cliente
- ✅ Envío automático de imágenes de productos
- ✅ Validación de datos en tiempo real
- ✅ Saludos según hora del día

### Gestión de Productos
- ✅ Catálogo completo con imágenes
- ✅ Múltiples formas de pago (contado, crédito, credicontado)
- ✅ Cálculo automático de cuotas
- ✅ Categorías personalizables
- ✅ Stock y disponibilidad

### Gestión de Clientes
- ✅ Base de datos completa
- ✅ Historial de compras
- ✅ Seguimiento de pagos
- ✅ Estado de cuenta individual
- ✅ Nóminas automáticas con fechas

### Pedidos WhatsApp
- ✅ Sistema de pedidos integrado
- ✅ Captura de datos: nombre, cédula, dirección, municipio
- ✅ Estados: pendiente, confirmado, enviado, entregado
- ✅ Panel administrativo completo

### Campañas
- ✅ Envío masivo de mensajes
- ✅ Segmentación de clientes
- ✅ Programación de campañas
- ✅ Estadísticas de envío

## 🛠️ Tecnologías

### Backend
- **Node.js** con TypeScript
- **Fastify** - Framework web rápido
- **Drizzle ORM** - Type-safe SQL
- **LibSQL/SQLite** - Base de datos
- **Baileys** - WhatsApp Web API
- **OpenAI** - IA conversacional

### Frontend
- **React** con TypeScript
- **TanStack Router** - Enrutamiento
- **TanStack Query** - Gestión de estado
- **Tailwind CSS** - Estilos
- **shadcn/ui** - Componentes UI

## 📦 Estructura del Proyecto

```
Appcreditorres/
├── apps/
│   ├── api/          # Backend (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── db/           # Base de datos y esquemas
│   │   │   ├── rutas/        # Endpoints API
│   │   │   ├── whatsapp/     # Lógica de WhatsApp
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── web/          # Frontend (React + TypeScript)
│       ├── src/
│       │   ├── componentes/  # Componentes React
│       │   ├── paginas/      # Páginas/vistas
│       │   └── App.tsx
│       └── package.json
│
├── deployment/       # Scripts de deployment
│   ├── README.md           # Guía de instalación
│   ├── install.sh          # Instalación inicial
│   ├── ecosystem.config.js # Configuración PM2
│   ├── nginx.conf          # Configuración Nginx
│   └── backup.sh           # Backup automático
│
├── prompt-agente-ventas.md # Prompt para el agente IA
└── package.json
```

## 🚀 Instalación Local

### Requisitos
- Node.js 20+
- npm o pnpm
- WhatsApp Business instalado en tu celular

### Pasos

```bash
# 1. Clonar repositorio
git clone https://github.com/TU-USUARIO/appcreditorres.git
cd appcreditorres

# 2. Instalar dependencias
npm install

# 3. Compilar el proyecto
npm run build

# 4. Iniciar la aplicación
npm run dev
```

### Acceder a la aplicación

1. Abre el navegador en `http://localhost:3000`
2. Ve a **Configuración → WhatsApp**
3. Escanea el código QR con WhatsApp Business
4. Configura tu API key de OpenAI en **Configuración → IA**

## 🌐 Deployment en Producción

### VPS (Hostinger, DigitalOcean, etc.)

Sigue la guía completa en [deployment/README.md](deployment/README.md)

**Resumen rápido:**

```bash
# 1. Conectar al VPS
ssh root@tu-ip

# 2. Ejecutar instalación
wget https://raw.githubusercontent.com/TU-USUARIO/appcreditorres/main/deployment/install.sh
chmod +x install.sh
./install.sh

# 3. Clonar proyecto
cd /var/www
git clone https://github.com/TU-USUARIO/appcreditorres.git

# 4. Configurar y desplegar
cd appcreditorres
npm install
npm run build
cp deployment/ecosystem.config.js .
pm2 start ecosystem.config.js
```

Ver [COMANDOS.md](deployment/COMANDOS.md) para referencia rápida.

## 📱 Configuración de WhatsApp

### Obtener WhatsApp Business

1. Descarga WhatsApp Business desde Play Store o App Store
2. Configura tu número de negocio
3. Escanea el QR desde la plataforma

### Personalizar el Agente de Ventas

El comportamiento del agente se configura en `prompt-agente-ventas.md`:
- Personalidad y tono
- Estrategias de venta
- Manejo de objeciones
- Ejemplos de conversaciones

## 🔐 Seguridad

**IMPORTANTE:** Nunca subas a Git:
- ❌ Archivos `.env` con credenciales
- ❌ `config-ia.json` (API keys)
- ❌ `whatsapp-session/` (credenciales de WhatsApp)
- ❌ `database.db` (datos sensibles)

Estos archivos están incluidos en `.gitignore`.

## 📊 Base de Datos

El sistema usa SQLite (LibSQL) con las siguientes tablas principales:

- `productos` - Catálogo de productos
- `clientes` - Base de clientes
- `ventas` - Registro de ventas
- `pagos` - Historial de pagos
- `conversaciones_whatsapp` - Historial de conversaciones
- `pedidos_whatsapp` - Pedidos desde WhatsApp
- `campanas_whatsapp` - Campañas de mensajes

## 🤖 Agente de Ventas IA

El agente está diseñado para:

1. **Saludar según hora del día** (Buenos días/tardes/noches)
2. **Mostrar productos del catálogo** con precios e imágenes
3. **Detectar interés del cliente** ("me gusta ese", "cuánto cuesta")
4. **Ampliar información** antes de pedir datos
5. **Presentar formas de pago** (contado, crédito, credicontado)
6. **Confirmar interés real** del cliente
7. **Recopilar datos** validando cada campo:
   - Nombre completo (mínimo 2 palabras)
   - Cédula (6-15 dígitos)
   - Dirección completa (min 10 caracteres)
   - Municipio/ciudad (3-50 caracteres)
8. **Confirmar pedido** y notificar que un asesor contactará

## 🔄 Actualización

```bash
# En el servidor
cd /var/www/appcreditorres
./deployment/update.sh
```

## 📞 Soporte

Para reportar problemas o sugerencias:
- GitHub Issues: [Tu repositorio]/issues

## 📄 Licencia

Este proyecto es de uso privado.

---

Desarrollado con ❤️ para facilitar las ventas a crédito
