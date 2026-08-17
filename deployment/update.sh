#!/bin/bash

# Script de actualización de la aplicación
# Úsalo cuando quieras actualizar la aplicación sin downtime significativo

set -e

APP_DIR="/var/www/appcreditorres"
APP_NAME="appcreditorres"

echo "======================================"
echo "Actualizando aplicación..."
echo "======================================"

cd "$APP_DIR"

# Hacer backup antes de actualizar
echo "1. Haciendo backup de seguridad..."
/root/backup.sh

# Si usas Git
if [ -d ".git" ]; then
    echo "2. Descargando última versión desde Git..."
    git pull origin main
else
    echo "2. ⚠ No se detectó repositorio Git, asegúrate de subir los archivos manualmente"
fi

# Instalar/actualizar dependencias
echo "3. Instalando dependencias..."
npm install --production

# Compilar TypeScript
echo "4. Compilando aplicación..."
npm run build

# Reiniciar aplicación con PM2
echo "5. Reiniciando aplicación..."
pm2 restart "$APP_NAME"

# Esperar que la aplicación inicie
echo "6. Verificando que la aplicación inició correctamente..."
sleep 5

# Verificar estado
if pm2 describe "$APP_NAME" | grep -q "online"; then
    echo ""
    echo "======================================"
    echo "✅ Actualización completada exitosamente"
    echo "======================================"
    pm2 status
else
    echo ""
    echo "======================================"
    echo "⚠ ERROR: La aplicación no inició correctamente"
    echo "======================================"
    echo "Revisa los logs con: pm2 logs $APP_NAME"
    exit 1
fi
