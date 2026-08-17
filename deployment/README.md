# Guía de Deployment - VPS Hostinger

Esta guía te ayudará a desplegar tu aplicación de créditos con WhatsApp en un VPS de Hostinger.

## 📋 Requisitos previos

- VPS con Ubuntu 22.04 LTS o Debian 11
- Acceso SSH (root o usuario con sudo)
- Dominio (opcional pero recomendado para SSL)
- Mínimo 2GB RAM, 2 CPU cores, 50GB SSD

## 🚀 Proceso de instalación

### 1. Conectarse al VPS

```bash
ssh root@tu-ip-del-vps
# O si tienes un usuario específico:
ssh usuario@tu-ip-del-vps
```

### 2. Ejecutar el script de instalación inicial

Copia el archivo `install.sh` al servidor y ejecútalo:

```bash
# Desde tu máquina local, copia el script al VPS:
scp deployment/install.sh root@tu-ip-del-vps:/root/

# Conecta al VPS y ejecuta:
ssh root@tu-ip-del-vps
chmod +x /root/install.sh
./install.sh
```

Este script instalará:
- Node.js 20
- PM2 (gestor de procesos)
- Nginx (servidor web y reverse proxy)
- Certbot (SSL gratuito)
- Git

### 3. Clonar el proyecto

```bash
cd /var/www
git clone https://github.com/TU-USUARIO/TU-REPO.git appcreditorres
cd appcreditorres
```

Si no usas Git, puedes subir los archivos con:
```bash
# Desde tu máquina local:
scp -r C:\Users\JUAND\Documents\Appcreditorres root@tu-ip-del-vps:/var/www/appcreditorres
```

### 4. Instalar dependencias y compilar

```bash
cd /var/www/appcreditorres
npm install
npm run build
```

### 5. Configurar variables de entorno

```bash
# Copia el archivo de ejemplo y edítalo:
cp deployment/.env.production /var/www/appcreditorres/.env
nano /var/www/appcreditorres/.env
```

Configura las variables según tu entorno (ver archivo `.env.production`).

### 6. Configurar PM2

```bash
# Copia la configuración de PM2:
cp deployment/ecosystem.config.js /var/www/appcreditorres/

# Inicia la aplicación:
cd /var/www/appcreditorres
pm2 start ecosystem.config.js

# Guardar configuración para auto-inicio:
pm2 save
pm2 startup
```

### 7. Configurar Nginx

```bash
# Copia la configuración de Nginx:
cp deployment/nginx.conf /etc/nginx/sites-available/appcreditorres

# Edita el archivo para poner tu dominio:
nano /etc/nginx/sites-available/appcreditorres

# Activa el sitio:
ln -s /etc/nginx/sites-available/appcreditorres /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # Opcional: remover sitio por defecto

# Verifica la configuración:
nginx -t

# Reinicia Nginx:
systemctl restart nginx
```

### 8. Configurar SSL (HTTPS)

```bash
# Si tienes un dominio configurado:
certbot --nginx -d tudominio.com -d www.tudominio.com

# Sigue las instrucciones en pantalla
# Certbot configurará automáticamente el SSL en Nginx
```

### 9. Configurar backup automático

```bash
# Copia el script de backup:
cp deployment/backup.sh /root/backup.sh
chmod +x /root/backup.sh

# Edita para configurar tu ruta de backup:
nano /root/backup.sh

# Configurar cron para backup diario a las 3 AM:
crontab -e
# Agrega esta línea:
0 3 * * * /root/backup.sh
```

## 🔍 Comandos útiles de PM2

```bash
# Ver estado de la aplicación:
pm2 status

# Ver logs en tiempo real:
pm2 logs

# Reiniciar aplicación:
pm2 restart appcreditorres

# Detener aplicación:
pm2 stop appcreditorres

# Ver métricas (CPU, memoria):
pm2 monit
```

## 🔄 Actualizar la aplicación

```bash
cd /var/www/appcreditorres

# Si usas Git:
git pull origin main
npm install
npm run build
pm2 restart appcreditorres

# Si subes archivos manualmente:
# 1. Sube los archivos nuevos
# 2. Ejecuta:
npm install
npm run build
pm2 restart appcreditorres
```

## 🔥 Firewall (Seguridad)

```bash
# Configurar UFW (firewall):
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

## 📱 Escanear QR de WhatsApp

Una vez la aplicación esté corriendo:

1. Accede a: `http://tu-dominio.com` o `http://tu-ip-del-vps`
2. Ve a la sección de Configuración WhatsApp
3. Escanea el QR con WhatsApp Business

**IMPORTANTE**: La sesión de WhatsApp se guardará en `/var/www/appcreditorres/whatsapp-session`. Haz backup de esta carpeta.

## 🐛 Solución de problemas

### La aplicación no inicia:
```bash
pm2 logs appcreditorres
# Revisa los errores en los logs
```

### Puerto ocupado:
```bash
# Ver qué proceso usa el puerto 3000:
lsof -i :3000
# Mata el proceso si es necesario:
kill -9 PID
```

### Nginx no funciona:
```bash
# Ver logs de Nginx:
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

### Base de datos corrupta:
```bash
# Restaurar desde backup:
cd /var/www/appcreditorres
cp /root/backups/FECHA/appcreditorres.db ./database.db
pm2 restart appcreditorres
```

## 📞 Soporte

Si tienes problemas, revisa:
1. Los logs de PM2: `pm2 logs`
2. Los logs de Nginx: `/var/log/nginx/error.log`
3. El estado del sistema: `pm2 monit`
