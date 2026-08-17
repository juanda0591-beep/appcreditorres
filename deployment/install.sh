#!/bin/bash

# Script de instalación para VPS Ubuntu/Debian
# Este script instala todas las dependencias necesarias para ejecutar la aplicación

set -e  # Detener si hay algún error

echo "======================================"
echo "Instalando dependencias del sistema..."
echo "======================================"

# Actualizar sistema
apt update && apt upgrade -y

# Instalar herramientas básicas
apt install -y curl wget git build-essential

# Instalar Node.js 20
echo "Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verificar instalación
echo "Node.js version:"
node --version
echo "NPM version:"
npm --version

# Instalar PM2 globalmente
echo "Instalando PM2..."
npm install -g pm2

# Instalar Nginx
echo "Instalando Nginx..."
apt install -y nginx

# Instalar Certbot para SSL
echo "Instalando Certbot..."
apt install -y certbot python3-certbot-nginx

# Crear directorio para la aplicación
echo "Creando directorios..."
mkdir -p /var/www/appcreditorres
mkdir -p /root/backups

# Configurar firewall básico
echo "Configurando firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
echo "y" | ufw enable

echo "======================================"
echo "Instalación completada!"
echo "======================================"
echo ""
echo "Siguiente paso:"
echo "1. Clona tu proyecto en /var/www/appcreditorres"
echo "2. Configura las variables de entorno"
echo "3. Ejecuta 'npm install && npm run build'"
echo "4. Configura PM2 y Nginx"
echo ""
echo "Ver README.md para instrucciones detalladas"
