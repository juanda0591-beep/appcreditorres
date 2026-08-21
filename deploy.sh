#!/bin/bash

# Script de deployment sin downtime
# Uso: bash deploy.sh

set -e  # Salir si hay algún error

echo "🚀 Iniciando deployment..."

# 1. Hacer stash de cambios locales si los hay
echo "📦 Guardando cambios locales temporalmente..."
git stash

# 2. Traer últimos cambios
echo "⬇️  Descargando últimos cambios..."
git pull origin main

# 3. Instalar dependencias
echo "📚 Instalando dependencias..."
npm install

# 4. Compilar backend
echo "🔨 Compilando backend..."
npm run build -w @credito/api

# 5. Compilar frontend
echo "🎨 Compilando frontend..."
npm run build -w @credito/web

# 6. Recargar PM2 sin downtime (reload en lugar de restart)
echo "🔄 Recargando aplicación sin downtime..."
/usr/lib/node_modules/pm2/bin/pm2 reload ecosystem.config.js --update-env

# 7. Esperar a que la app esté lista
echo "⏳ Esperando que la aplicación esté lista..."
sleep 3

# 8. Verificar estado
echo "✅ Verificando estado..."
/usr/lib/node_modules/pm2/bin/pm2 status

echo ""
echo "🎉 Deployment completado exitosamente!"
echo ""
echo "📊 Para ver logs en tiempo real:"
echo "   /usr/lib/node_modules/pm2/bin/pm2 logs appcreditorres"
