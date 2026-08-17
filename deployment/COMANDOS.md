# Comandos Rápidos - Cheat Sheet

## 🚀 Deployment Inicial

```bash
# 1. Conectar al VPS
ssh root@TU_IP

# 2. Ejecutar instalación
chmod +x /root/install.sh
./install.sh

# 3. Clonar proyecto
cd /var/www
git clone https://github.com/TU-REPO.git appcreditorres
cd appcreditorres

# 4. Instalar y compilar
npm install
npm run build

# 5. Configurar variables de entorno
cp deployment/.env.production .env
nano .env

# 6. Iniciar con PM2
cp deployment/ecosystem.config.js .
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 7. Configurar Nginx
cp deployment/nginx.conf /etc/nginx/sites-available/appcreditorres
nano /etc/nginx/sites-available/appcreditorres  # Editar dominio
ln -s /etc/nginx/sites-available/appcreditorres /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# 8. Configurar SSL (si tienes dominio)
certbot --nginx -d tudominio.com

# 9. Configurar backup automático
cp deployment/backup.sh /root/
chmod +x /root/backup.sh
crontab -e
# Agregar: 0 3 * * * /root/backup.sh
```

## 📦 Actualizar Aplicación

```bash
# Método 1: Script automático
cd /var/www/appcreditorres
chmod +x deployment/update.sh
./deployment/update.sh

# Método 2: Manual
cd /var/www/appcreditorres
git pull origin main
npm install
npm run build
pm2 restart appcreditorres
```

## 🔍 Monitoreo y Logs

```bash
# Ver estado de la aplicación
pm2 status

# Ver logs en tiempo real
pm2 logs appcreditorres

# Ver solo errores
pm2 logs appcreditorres --err

# Ver logs de Nginx
tail -f /var/log/nginx/appcreditorres-error.log
tail -f /var/log/nginx/appcreditorres-access.log

# Métricas en tiempo real (CPU, memoria)
pm2 monit

# Ver información detallada
pm2 describe appcreditorres
```

## 🔄 Gestión de PM2

```bash
# Reiniciar aplicación
pm2 restart appcreditorres

# Detener aplicación
pm2 stop appcreditorres

# Eliminar de PM2
pm2 delete appcreditorres

# Ver procesos
pm2 list

# Limpiar logs antiguos
pm2 flush
```

## 🗄️ Base de Datos

```bash
# Ver tamaño de la base de datos
du -h /var/www/appcreditorres/database.db

# Hacer backup manual
cp /var/www/appcreditorres/database.db /root/backups/manual-$(date +%Y%m%d).db

# Restaurar desde backup
pm2 stop appcreditorres
cp /root/backups/FECHA.tar.gz /tmp/
cd /tmp
tar -xzf FECHA.tar.gz
cp FECHA/database.db /var/www/appcreditorres/database.db
pm2 restart appcreditorres
```

## 🔒 Seguridad

```bash
# Ver estado del firewall
ufw status

# Ver intentos de acceso SSH fallidos
grep "Failed password" /var/log/auth.log | tail -20

# Ver conexiones activas
netstat -tuln | grep LISTEN

# Verificar usuarios logueados
who
last
```

## 📱 WhatsApp

```bash
# Ver archivos de sesión
ls -la /var/www/appcreditorres/whatsapp-session/

# Backup manual de sesión
tar -czf /root/backups/whatsapp-session-$(date +%Y%m%d).tar.gz \
  /var/www/appcreditorres/whatsapp-session/

# Limpiar sesión (para volver a escanear QR)
pm2 stop appcreditorres
rm -rf /var/www/appcreditorres/whatsapp-session/*
pm2 restart appcreditorres
```

## 🌐 Nginx

```bash
# Probar configuración
nginx -t

# Reiniciar Nginx
systemctl restart nginx

# Ver estado
systemctl status nginx

# Recargar configuración (sin downtime)
nginx -s reload

# Ver sitios activos
ls -la /etc/nginx/sites-enabled/
```

## 🔐 SSL/Certificados

```bash
# Renovar certificados SSL
certbot renew

# Ver estado de certificados
certbot certificates

# Renovación en modo dry-run (prueba)
certbot renew --dry-run
```

## 💾 Backup y Restauración

```bash
# Ejecutar backup manual
/root/backup.sh

# Ver backups disponibles
ls -lh /root/backups/

# Eliminar backups antiguos manualmente
find /root/backups/ -name "*.tar.gz" -mtime +30 -delete

# Restaurar backup completo
pm2 stop appcreditorres
tar -xzf /root/backups/FECHA.tar.gz -C /tmp/
cp /tmp/FECHA/database.db /var/www/appcreditorres/
cp -r /tmp/FECHA/whatsapp-session /var/www/appcreditorres/
pm2 restart appcreditorres
```

## 📊 Uso de Recursos

```bash
# Ver uso de CPU y RAM
htop

# Ver espacio en disco
df -h

# Ver procesos que más consumen
top

# Ver uso de memoria detallado
free -m

# Ver procesos de Node.js
ps aux | grep node
```

## 🐛 Solución de Problemas

```bash
# La aplicación no responde
pm2 restart appcreditorres
pm2 logs appcreditorres --lines 50

# Puerto 3000 ocupado
lsof -i :3000
kill -9 PID

# Nginx no funciona
nginx -t
systemctl status nginx
tail -f /var/log/nginx/error.log

# Espacio en disco lleno
du -sh /var/www/appcreditorres/*
du -sh /root/backups/*
pm2 flush  # Limpiar logs de PM2

# Memoria llena
pm2 restart appcreditorres
# O ajustar max_memory_restart en ecosystem.config.js

# Permisos incorrectos
chown -R www-data:www-data /var/www/appcreditorres
chmod -R 755 /var/www/appcreditorres
```

## 🔄 Automatizaciones Útiles

```bash
# Auto-reinicio diario (si hay memory leaks)
# Agregar a crontab:
0 4 * * * pm2 restart appcreditorres

# Limpiar logs cada semana
0 0 * * 0 pm2 flush

# Backup semanal adicional
0 2 * * 0 /root/backup.sh
```

## 📞 Acceso a la Aplicación

```bash
# Por IP
http://TU_IP

# Por dominio (con SSL)
https://tudominio.com

# Ver logs de acceso en tiempo real
tail -f /var/log/nginx/appcreditorres-access.log
```
