#!/bin/bash

# Script de deployment rápido para VPS
# Ejecutar con: bash deploy-rapido.sh

set -e

echo "======================================"
echo "🚀 Deployment AppCreditorres"
echo "======================================"
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Paso 1/9:${NC} Actualizando sistema..."
apt update && apt upgrade -y

echo -e "${BLUE}Paso 2/9:${NC} Instalando herramientas básicas..."
apt install -y curl wget git build-essential

echo -e "${BLUE}Paso 3/9:${NC} Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo -e "${GREEN}✓ Node.js instalado:${NC}"
node --version
npm --version

echo -e "${BLUE}Paso 4/9:${NC} Instalando PM2..."
npm install -g pm2

echo -e "${BLUE}Paso 5/9:${NC} Instalando Nginx..."
apt install -y nginx

echo -e "${BLUE}Paso 6/9:${NC} Clonando proyecto desde GitHub..."
cd /var/www
if [ -d "appcreditorres" ]; then
    echo "⚠ Directorio ya existe, actualizando..."
    cd appcreditorres
    git pull origin main
else
    git clone https://github.com/juanda0591-beep/appcreditorres.git
    cd appcreditorres
fi

echo -e "${BLUE}Paso 7/9:${NC} Instalando dependencias del proyecto..."
npm install

echo -e "${BLUE}Paso 8/9:${NC} Compilando aplicación..."
npm run build

echo -e "${BLUE}Paso 9/9:${NC} Configurando archivos..."
# Crear directorios necesarios
mkdir -p /root/backups
mkdir -p /var/log/pm2

# Copiar archivo de configuración de ejemplo
if [ ! -f .env ]; then
    cp deployment/.env.production .env
    echo "⚠ IMPORTANTE: Edita el archivo .env con tus configuraciones"
fi

# Hacer scripts ejecutables
chmod +x deployment/*.sh

echo ""
echo "======================================"
echo -e "${GREEN}✅ Instalación completada${NC}"
echo "======================================"
echo ""
echo "Siguientes pasos manuales:"
echo ""
echo "1. Edita las variables de entorno:"
echo "   nano /var/www/appcreditorres/.env"
echo ""
echo "2. Inicia la aplicación con PM2:"
echo "   cd /var/www/appcreditorres"
echo "   pm2 start deployment/ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "3. Configura Nginx:"
echo "   cp deployment/nginx.conf /etc/nginx/sites-available/appcreditorres"
echo "   nano /etc/nginx/sites-available/appcreditorres  # Edita tu dominio/IP"
echo "   ln -s /etc/nginx/sites-available/appcreditorres /etc/nginx/sites-enabled/"
echo "   nginx -t"
echo "   systemctl restart nginx"
echo ""
echo "4. Configura firewall:"
echo "   ufw allow OpenSSH"
echo "   ufw allow 'Nginx Full'"
echo "   ufw enable"
echo ""
echo "5. Accede a tu aplicación en:"
echo "   http://187.127.54.58"
echo ""
