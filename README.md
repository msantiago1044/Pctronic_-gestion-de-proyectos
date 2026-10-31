# Pctronic — Sistema de Gestión de Proyectos

Aplicación web para gestión integral de proyectos de seguridad electrónica (CCTV, control de acceso, alarmas, cableado estructurado, mano de obra y facturación), conectada a **Supabase** y optimizada para despliegue en **Vercel**.

---

## 🚀 Despliegue en Vercel (Recomendado)

1. **Sube o conecta este repositorio en Vercel**:
   - Entra a [vercel.com](https://vercel.com) e importa tu repositorio `Pctronic_-gestion-de-proyectos`.
2. **Configura las Variables de Entorno en Vercel**:
   - En la pantalla de importación (o en **Project Settings → Environment Variables**), agrega:
     - `SUPABASE_URL`: La URL de tu proyecto de Supabase (ej. `https://xyz.supabase.co`).
     - `SUPABASE_ANON_KEY`: La llave pública `anon` de tu proyecto.
     - `NOMBRE_EMPRESA`: (Opcional) `Pctronic Seguridad Electrónica`.
3. **Haz click en "Deploy"**:
   - Vercel ejecutará automáticamente `npm run build` (`scripts/build.js`), inyectando de forma segura tus variables de entorno sin exponerlas en el código fuente de GitHub.
   - ¡Listo! Tu app estará en línea con URLs limpias y cabeceras de seguridad activadas (`vercel.json`).

---

## 💻 Desarrollo Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/msantiago1044/Pctronic_-gestion-de-proyectos.git
   cd Pctronic_-gestion-de-proyectos
   ```
2. Crea tu archivo `.env` basado en la plantilla:
   ```bash
   cp .env.example .env
   ```
3. Edita `.env` con la URL y la llave `anon` de tu Supabase.
4. Genera la configuración local:
   ```bash
   npm run build
   # o: node scripts/build.js
   ```
5. Abre `index.html` o usa un servidor local (por ejemplo `npx serve .` o Live Server en VS Code).

---

## 🔒 Seguridad y Buenas Prácticas

- **Cero secretos en GitHub**: Las credenciales de Supabase no quedan registradas en el repositorio público; se inyectan en tiempo de construcción en Vercel o mediante `.env` local (ignorado por `.gitignore`).
- **Control de Acceso y RLS**: Todas las tablas tienen Row Level Security activado. Solo los administradores pueden cambiar roles de usuario o autorizar nuevos proyectos.
- **Documentos Protegidos**: El almacenamiento de planos, contratos y pólizas (`storage.buckets/documentos`) es privado y requiere sesión autenticada.
- **Cabeceras HTTP de Seguridad**: El archivo `vercel.json` implementa protección contra clickjacking (`X-Frame-Options`), inyección MIME (`X-Content-Type-Options: nosniff`), y control de permisos.

---

## 📂 Estructura del Proyecto

```
├── index.html              → Redirige a login o dashboard según el estado de la sesión
├── login.html              → Pantalla de autenticación
├── dashboard.html          → Panel de control y KPIs de gerencia
├── proyectos.html          → Listado general de proyectos
├── proyecto-nuevo.html      → Asistente para crear proyecto (importa cotizaciones Excel)
├── proyecto-detalle.html    → Vista integral: Cotización, Costos, Avance, Cortes, Mano de Obra, Documentos
├── facturacion.html         → Control de facturas emitidas y pendientes
├── compras.html             → Compras, materiales y costos de proyectos
├── suministros.html         → Catálogo de ventas de suministros
├── clientes.html            → Directorio de clientes
├── contratistas.html        → Directorio de contratistas y cuadrillas
├── proveedores.html         → Directorio de proveedores
├── empresas.html            → Gestión de empresas ejecutoras
├── usuarios.html            → Control de usuarios y asignación de roles (admin)
├── assets/
│   ├── js/config.js        → Configuración cliente (generada en build o local)
│   ├── js/supabaseClient.js → Inicialización segura del cliente Supabase
│   ├── js/util.js          → Formato de moneda, fechas y sanitización HTML
│   └── js/proy/            → Módulos específicos de proyectos (avance, cortes, mano de obra, etc.)
├── sql/
│   ├── schema.sql          → Esquema completo de la base de datos con políticas RLS
│   └── migracion_*.sql     → Scripts de actualización incremental
├── vercel.json             → Configuración de despliegue, cleanUrls y cabeceras de seguridad
├── package.json            → Definición de scripts de build
└── .env.example            → Plantilla para variables de entorno
```

---

## 🗄️ Base de Datos (Supabase)

Si configuras una base de datos nueva:
1. Abre tu proyecto en Supabase → **SQL Editor**.
2. Ejecuta el script `sql/schema.sql`.

Si ya tienes una base de datos existente:
- Ejecuta los scripts de migración correspondientes en la carpeta `sql/` (ej. `sql/migracion_2026-10_seguridad_rls.sql`).
