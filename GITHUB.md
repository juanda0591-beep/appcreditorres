# Guía para Subir el Proyecto a GitHub

## 📋 Pasos para crear el repositorio y subir el código

### 1. Crear repositorio en GitHub

1. Ve a https://github.com
2. Haz clic en el botón **"New"** o **"+"** → **"New repository"**
3. Configura el repositorio:
   - **Repository name:** `appcreditorres` (o el nombre que prefieras)
   - **Description:** "Sistema de ventas a crédito con WhatsApp Business"
   - **Visibility:** 
     - ✅ **Private** (recomendado - para uso privado)
     - ⚠️ Public (solo si quieres compartirlo públicamente)
   - **NO** marques "Initialize with README" (ya tenemos uno)
4. Haz clic en **"Create repository"**

### 2. Preparar el proyecto localmente

Abre Git Bash en la carpeta del proyecto y ejecuta:

```bash
# Navegar a la carpeta del proyecto
cd /c/Users/JUAND/Documents/Appcreditorres

# Inicializar repositorio Git (si no está inicializado)
git init

# Agregar todos los archivos (respetando .gitignore)
git add .

# Ver qué archivos se van a subir
git status

# Crear el primer commit
git commit -m "Initial commit: Sistema de ventas a crédito con WhatsApp"
```

### 3. Conectar con GitHub y subir

```bash
# Cambiar a la rama main (GitHub usa main por defecto ahora)
git branch -M main

# Conectar con tu repositorio de GitHub
# Reemplaza TU-USUARIO por tu nombre de usuario de GitHub
git remote add origin https://github.com/TU-USUARIO/appcreditorres.git

# Subir el código a GitHub
git push -u origin main
```

**Nota:** GitHub te pedirá autenticación. Usa:
- **Personal Access Token** (recomendado)
- O configura SSH keys

### 4. Generar Personal Access Token (si es necesario)

Si GitHub te pide contraseña y no funciona:

1. Ve a GitHub → **Settings** (tu perfil)
2. **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. **Generate new token** → **Generate new token (classic)**
4. Configura:
   - **Note:** "Appcreditorres deployment"
   - **Expiration:** 90 días o lo que prefieras
   - **Scopes:** Marca `repo` (acceso completo a repositorios)
5. **Generate token**
6. **COPIA EL TOKEN** (no podrás verlo de nuevo)
7. Usa el token como contraseña cuando Git te lo pida

### 5. Verificar que se subió correctamente

```bash
# Ver información del repositorio remoto
git remote -v

# Ver commits
git log --oneline
```

Luego ve a `https://github.com/TU-USUARIO/appcreditorres` y verifica que todos los archivos estén ahí.

## 📝 Verificación antes de subir

Antes de hacer `git add .`, verifica que estos archivos **NO** se suban:

```bash
# Ver qué archivos serán ignorados
git status --ignored

# Asegúrate de que estos NO aparezcan en "git status":
# ❌ .env
# ❌ config-ia.json
# ❌ whatsapp-session/
# ❌ *.db
# ❌ node_modules/
```

Si alguno de estos aparece, verifica tu `.gitignore`.

## 🔄 Actualizaciones futuras

Cuando hagas cambios al proyecto:

```bash
# Ver archivos modificados
git status

# Agregar archivos modificados
git add .

# Crear commit con descripción del cambio
git commit -m "Descripción de los cambios realizados"

# Subir cambios a GitHub
git push origin main
```

## 📦 Clonar el proyecto en el servidor VPS

Una vez subido a GitHub, en tu VPS:

```bash
# Clonar repositorio (privado)
cd /var/www
git clone https://github.com/TU-USUARIO/appcreditorres.git

# Si es privado, te pedirá autenticación
# Usa tu username y el Personal Access Token como contraseña
```

## 🔐 Credenciales en el VPS

Después de clonar en el VPS, configura las credenciales:

```bash
cd /var/www/appcreditorres

# Crear archivo .env (NO está en Git)
cp deployment/.env.production .env
nano .env

# Configurar las variables específicas del servidor
```

## ⚠️ IMPORTANTE: Seguridad

### NO subas a GitHub:
- ❌ API keys de OpenAI
- ❌ Credenciales de WhatsApp
- ❌ Base de datos con datos reales
- ❌ Archivos .env con valores reales

### SÍ sube a GitHub:
- ✅ Código fuente
- ✅ Archivos de configuración de ejemplo (.env.production)
- ✅ Scripts de deployment
- ✅ Documentación

## 🆘 Solución de problemas

### Error: "Permission denied"
```bash
# Configurar SSH o usar HTTPS con Personal Access Token
git remote set-url origin https://github.com/TU-USUARIO/appcreditorres.git
```

### Error: "Repository not found"
```bash
# Verifica que la URL sea correcta
git remote -v

# Si es incorrecta, actualízala:
git remote set-url origin https://github.com/TU-USUARIO/appcreditorres.git
```

### Cambiar de repositorio remoto
```bash
# Eliminar origen actual
git remote remove origin

# Agregar nuevo origen
git remote add origin https://github.com/NUEVO-USUARIO/nuevo-repo.git
git push -u origin main
```

## 📊 Estructura del repositorio en GitHub

```
appcreditorres/
├── .github/              # (opcional) GitHub Actions
├── apps/
│   ├── api/
│   └── web/
├── deployment/           # ✅ Scripts de deployment
├── .gitignore           # ✅ Archivos a ignorar
├── README.md            # ✅ Documentación principal
├── prompt-agente-ventas.md  # ✅ Configuración del agente
└── package.json
```

## ✅ Checklist final

Antes de subir a GitHub, verifica:

- [ ] `.gitignore` está configurado correctamente
- [ ] No hay archivos `.env` con credenciales reales
- [ ] No hay `config-ia.json` con API keys
- [ ] No hay carpeta `whatsapp-session/`
- [ ] No hay archivos `.db` con datos reales
- [ ] El README.md tiene la información correcta
- [ ] Los scripts de deployment están incluidos
- [ ] Has probado que el código compila (`npm run build`)

¡Listo para subir a GitHub! 🚀
