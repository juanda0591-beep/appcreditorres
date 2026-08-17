# Configuración del Agente de IA para WhatsApp

## 🎯 Descripción

Este sistema integra un agente de IA (OpenAI GPT-4) con WhatsApp Business API para:
- Responder automáticamente consultas de clientes
- Enviar catálogo de productos con imágenes
- Tomar pedidos
- Gestionar conversaciones
- Enviar campañas masivas

---

## 📋 Requisitos Previos

### 1. Cuenta de Meta Business
- Crear cuenta en [Meta Business Suite](https://business.facebook.com/)
- Verificar tu negocio
- Solicitar acceso a WhatsApp Business API

### 2. API Key de OpenAI
- Crear cuenta en [OpenAI](https://platform.openai.com/)
- Generar API Key en la sección de API Keys
- Agregar créditos a tu cuenta

---

## ⚙️ Configuración

### 1. Variables de Entorno

Agrega estas variables a tu archivo `.env`:

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx

# WhatsApp Business API
WHATSAPP_TOKEN=EAAxxxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=mi_token_secreto_12345

# URL pública de tu servidor (para enviar imágenes)
PUBLIC_URL=https://tu-dominio.com
```

### 2. Configurar WhatsApp Business API

#### Opción A: Usar Meta directamente (Gratis pero complejo)

1. Ve a [Meta for Developers](https://developers.facebook.com/)
2. Crea una App → Tipo "Business"
3. Agrega el producto "WhatsApp"
4. En "Configuration":
   - Copia el `WHATSAPP_TOKEN` (temporal por 24h, luego genera uno permanente)
   - Copia el `WHATSAPP_PHONE_NUMBER_ID`
5. En "Webhooks":
   - URL del webhook: `https://tu-dominio.com/api/whatsapp/webhook`
   - Token de verificación: el mismo valor de `WHATSAPP_VERIFY_TOKEN`
   - Suscríbete a: `messages`

#### Opción B: Usar un proveedor (Más fácil, con costo)

**Twilio** (Recomendado para empezar):
- Registro: [twilio.com/whatsapp](https://www.twilio.com/whatsapp)
- Costo: ~$0.005 por mensaje
- Configuración automática del webhook

**360Dialog**:
- Más económico para alto volumen
- Registro: [360dialog.com](https://www.360dialog.com/)

**MessageBird**:
- Buena opción para Latinoamérica
- Registro: [messagebird.com](https://www.messagebird.com/)

---

## 🗄️ Migración de Base de Datos

Ejecuta la migración para crear las tablas necesarias:

```bash
npm run db:generate --workspace @credito/api
npm run db:migrate --workspace @credito/api
```

Esto creará las siguientes tablas:
- `conversaciones_whatsapp`: Historial de conversaciones
- `mensajes_whatsapp`: Todos los mensajes
- `pedidos_whatsapp`: Pedidos realizados
- `campanas_whatsapp`: Campañas de marketing

---

## 🚀 Uso

### 1. Iniciar el Servidor

```bash
npm run dev --workspace @credito/api
```

### 2. Verificar el Webhook

Meta enviará una petición GET para verificar tu webhook. El servidor responderá automáticamente si el token es correcto.

### 3. Probar el Agente

1. Envía un mensaje de WhatsApp al número configurado
2. El agente responderá automáticamente
3. Puedes preguntar sobre:
   - Productos disponibles
   - Precios y promociones
   - Hacer pedidos
   - Consultar información

### Ejemplos de conversación:

```
Cliente: Hola, qué productos tienen?
Agente: ¡Hola! 👋 Tenemos varios productos disponibles:
- Producto 1: Descripción... $100
- Producto 2: Descripción... $200
¿Te interesa alguno en particular?

Cliente: Me interesa el producto 1
Agente: ¡Excelente elección! 📦
[Envía imagen del producto]
El Producto 1 cuesta $100. ¿Te gustaría hacer un pedido?

Cliente: Sí, quiero ordenar
Agente: Perfecto! Para procesar tu pedido necesito:
- Tu nombre completo
- Dirección de entrega
- Teléfono de contacto
```

---

## 🎨 Personalización del Agente

Puedes modificar el comportamiento del agente editando el archivo:
`apps/api/src/servicios/agente-ia.ts`

### Cambiar el prompt del sistema:

```typescript
const mensajeSistema: Mensaje = {
  role: 'system',
  content: `Eres un asistente virtual de ventas...
  
  // Modifica aquí:
  - El tono (formal, casual, divertido)
  - Las reglas de negocio
  - La información que solicitas
  - Los productos que destacas
  `
};
```

### Cambiar el modelo de IA:

```typescript
const respuesta = await openai.chat.completions.create({
  model: 'gpt-4o-mini', // Opciones: gpt-4o, gpt-4o-mini, gpt-3.5-turbo
  // gpt-4o-mini: Más rápido y económico
  // gpt-4o: Más inteligente pero más caro
});
```

---

## 💰 Costos Estimados

### OpenAI (GPT-4o-mini):
- Input: $0.15 por 1M tokens (~$0.0001 por mensaje)
- Output: $0.60 por 1M tokens (~$0.0003 por mensaje)
- **Costo por conversación**: ~$0.002 USD

### WhatsApp Business API:
- Conversaciones de servicio (cliente inicia): Gratis primeras 1000/mes
- Conversaciones de marketing (tú inicias): ~$0.01-0.05 USD por mensaje
- Varía según el país

### Ejemplo mensual (100 conversaciones/día):
- 3000 conversaciones al mes
- OpenAI: ~$6 USD
- WhatsApp: ~$0-50 USD (depende de quién inicia)
- **Total: $6-56 USD/mes**

---

## 📊 Panel de Administración (Próximamente)

Podrás gestionar:
- ✅ Ver todas las conversaciones activas
- ✅ Historial de mensajes
- ✅ Crear campañas de marketing
- ✅ Ver pedidos realizados
- ✅ Estadísticas de conversión

---

## 🔧 Solución de Problemas

### El webhook no se verifica:
- Verifica que `WHATSAPP_VERIFY_TOKEN` coincida en Meta y en tu `.env`
- Asegúrate de que tu servidor sea accesible públicamente (usa ngrok en desarrollo)

### Los mensajes no llegan:
- Verifica que el webhook esté suscrito a "messages"
- Revisa los logs del servidor: `npm run dev --workspace @credito/api`
- Verifica que el `WHATSAPP_TOKEN` sea válido

### El agente no responde correctamente:
- Verifica que `OPENAI_API_KEY` sea válida
- Revisa que tengas créditos en OpenAI
- Chequea los logs para ver errores específicos

### Las imágenes no se envían:
- Asegúrate de que `PUBLIC_URL` sea accesible públicamente
- Verifica que las rutas de imágenes estén correctas
- Las imágenes deben ser accesibles sin autenticación

---

## 🌐 Despliegue en Producción

### Usar ngrok para desarrollo:
```bash
ngrok http 3000
# Copia la URL pública y úsala como webhook en Meta
```

### Desplegar en producción:
1. **Railway/Render/Fly.io**: Despliega tu API
2. Configura las variables de entorno
3. Actualiza la URL del webhook en Meta
4. Verifica que el puerto sea el correcto

---

## 📞 Soporte

Para problemas o preguntas:
- Documentación OpenAI: https://platform.openai.com/docs
- Documentación WhatsApp: https://developers.facebook.com/docs/whatsapp
- GitHub Issues: Reporta bugs en el repositorio del proyecto

---

## ✨ Próximas Funcionalidades

- [ ] Panel de administración web
- [ ] Campañas programadas
- [ ] Respuestas rápidas predefinidas
- [ ] Integración con pasarela de pago
- [ ] Notificaciones de estado de pedido
- [ ] Analytics y reportes
- [ ] Chatbot con flujos personalizados
- [ ] Integración con CRM

