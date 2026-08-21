# 🚀 Deployment Guide

## Deployment sin downtime en VPS

### Método 1: Script automático (Recomendado)

Simplemente ejecuta el script de deployment:

```bash
cd /var/www/appcreditorres
bash deploy.sh
```

Esto hará automáticamente:
- ✅ Guardar cambios locales temporalmente
- ✅ Descargar últimos cambios del repositorio
- ✅ Instalar dependencias
- ✅ Compilar backend y frontend
- ✅ Recargar la aplicación sin downtime
- ✅ Verificar que todo funcione

### Método 2: Comandos manuales

Si prefieres hacerlo paso a paso:

```bash
cd /var/www/appcreditorres

# 1. Guardar cambios locales
git stash

# 2. Traer cambios
git pull origin main

# 3. Instalar dependencias
npm install

# 4. Compilar
npm run build -w @credito/api
npm run build -w @credito/web

# 5. Recargar sin downtime
/usr/lib/node_modules/pm2/bin/pm2 reload ecosystem.config.js --update-env

# 6. Ver logs
/usr/lib/node_modules/pm2/bin/pm2 logs appcreditorres --lines 30
```

## Comandos útiles de PM2

```bash
# Ver estado de la aplicación
/usr/lib/node_modules/pm2/bin/pm2 status

# Ver logs en tiempo real
/usr/lib/node_modules/pm2/bin/pm2 logs appcreditorres

# Reiniciar (con breve downtime)
/usr/lib/node_modules/pm2/bin/pm2 restart appcreditorres

# Recargar (sin downtime)
/usr/lib/node_modules/pm2/bin/pm2 reload appcreditorres

# Ver información detallada
/usr/lib/node_modules/pm2/bin/pm2 describe appcreditorres

# Ver monitoreo en tiempo real
/usr/lib/node_modules/pm2/bin/pm2 monit
```

## Notas importantes

- **Error 502**: Si ves error 502 después del deployment, es normal durante 2-3 segundos mientras la app reinicia
- **pm2 reload vs restart**: Usa `reload` para zero-downtime, usa `restart` solo si hay problemas
- **Stash**: El script hace `git stash` automáticamente para archivos como `tsconfig.tsbuildinfo` que se generan en el servidor

## Troubleshooting

### Error: "Your local changes would be overwritten"
```bash
git stash
git pull origin main
```

### La app no arranca después de deployment
```bash
# Ver logs de error
/usr/lib/node_modules/pm2/bin/pm2 logs appcreditorres --err --lines 50

# Verificar que la compilación fue exitosa
ls -la apps/api/dist/server.js

# Reiniciar completamente
/usr/lib/node_modules/pm2/bin/pm2 restart appcreditorres
```

### WhatsApp no conecta
```bash
# Verificar estado de WhatsApp en los logs
/usr/lib/node_modules/pm2/bin/pm2 logs appcreditorres | grep -i whatsapp

# Eliminar sesión y reconectar (requiere escanear QR nuevamente)
rm -rf /var/www/appcreditorres/baileys_auth_info
/usr/lib/node_modules/pm2/bin/pm2 restart appcreditorres
```
