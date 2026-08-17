#!/bin/bash

# Script de backup automático
# Este script hace backup de la base de datos y archivos importantes

set -e

# Configuración
APP_DIR="/var/www/appcreditorres"
BACKUP_DIR="/root/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_PATH="$BACKUP_DIR/$DATE"

# Crear directorio de backup
mkdir -p "$BACKUP_PATH"

echo "======================================"
echo "Iniciando backup: $DATE"
echo "======================================"

# Backup de la base de datos
echo "Haciendo backup de la base de datos..."
if [ -f "$APP_DIR/database.db" ]; then
    cp "$APP_DIR/database.db" "$BACKUP_PATH/database.db"
    echo "✓ Base de datos respaldada"
else
    echo "⚠ No se encontró la base de datos"
fi

# Backup de la sesión de WhatsApp
echo "Haciendo backup de la sesión de WhatsApp..."
if [ -d "$APP_DIR/whatsapp-session" ]; then
    cp -r "$APP_DIR/whatsapp-session" "$BACKUP_PATH/whatsapp-session"
    echo "✓ Sesión de WhatsApp respaldada"
else
    echo "⚠ No se encontró la sesión de WhatsApp"
fi

# Backup de archivos de configuración
echo "Haciendo backup de configuración..."
if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$BACKUP_PATH/.env"
    echo "✓ Variables de entorno respaldadas"
fi

# Backup de imágenes de productos
echo "Haciendo backup de imágenes de productos..."
if [ -d "$APP_DIR/uploads" ]; then
    cp -r "$APP_DIR/uploads" "$BACKUP_PATH/uploads"
    echo "✓ Imágenes respaldadas"
fi

# Comprimir el backup
echo "Comprimiendo backup..."
cd "$BACKUP_DIR"
tar -czf "$DATE.tar.gz" "$DATE"
rm -rf "$DATE"
echo "✓ Backup comprimido: $DATE.tar.gz"

# Eliminar backups antiguos (mantener solo los últimos 7 días)
echo "Limpiando backups antiguos..."
find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +7 -delete
echo "✓ Backups antiguos eliminados"

# Mostrar tamaño del backup
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$DATE.tar.gz" | cut -f1)
echo ""
echo "======================================"
echo "Backup completado exitosamente"
echo "Archivo: $DATE.tar.gz"
echo "Tamaño: $BACKUP_SIZE"
echo "======================================"

# Opcional: enviar notificación (descomenta si quieres recibir notificaciones)
# curl -X POST "https://api.telegram.org/botTOKEN/sendMessage" \
#   -d "chat_id=YOUR_CHAT_ID" \
#   -d "text=✅ Backup completado: $DATE.tar.gz ($BACKUP_SIZE)"
