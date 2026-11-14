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
4. Genera la configuración local, compila los estilos y valida sintaxis/pruebas:
   ```bash
   npm run build:css
   npm run build
   npm run lint
   npm test
   # o: node scripts/build.js
   ```
   - `npm run build:css` compila Tailwind CSS (`assets/css/tailwind.input.css` → `assets/css/tailwind.min.css`), paso también incluido en `npm run build`.
   - `npm test` ejecuta la suite de pruebas unitarias (`node --test tests/*.test.mjs`).
5. Levanta un servidor HTTP local (recomendado en lugar de abrir archivos `file://` directamente):
   ```bash
   npx serve .
   ```

---

## 🔒 Seguridad y Buenas Prácticas

- **Cero secretos en GitHub**: Las credenciales de Supabase no quedan registradas en el repositorio público; se inyectan en tiempo de construcción en Vercel o mediante `.env` local (ignorado por `.gitignore`). En entornos `VERCEL` o `CI`, `npm run build` falla si faltan `SUPABASE_URL` o `SUPABASE_ANON_KEY`.
- **Control de Acceso, Roles y RLS**: Todas las tablas tienen Row Level Security activado. Existen 5 roles operativos (`super_usuario`, `directivo`, `comercial`, `proyectos`, `compras`, manteniendo compatibilidad con `admin`/`miembro`). Solo `super_usuario` puede administrar roles en `usuarios.html` o ejecutar eliminaciones (`DELETE`) sobre registros críticos.
- **Documentos Protegidos**: El almacenamiento de planos, contratos y pólizas (`storage.buckets/documentos`) es privado y requiere sesión autenticada; `avatars` restringe escritura/borrado al propietario y `logos` a `super_usuario`.
- **Cabeceras HTTP de Seguridad, CSP estricta y SRI**: El archivo `vercel.json` implementa `Strict-Transport-Security`, protección contra clickjacking (`X-Frame-Options`), inyección MIME (`X-Content-Type-Options: nosniff`), `Referrer-Policy` y `Permissions-Policy`. Las páginas HTML aplican una política `Content-Security-Policy` (CSP) estricta y validación Subresource Integrity (`integrity=`) en las librerías externas cargadas por CDN, junto con Tailwind CSS compilado localmente (`assets/css/tailwind.min.css`).

---

## 📂 Estructura del Proyecto

```
├── index.html              → Redirige a login o dashboard según el estado de la sesión
├── login.html              → Pantalla de autenticación
├── perfil.html             → Perfil de usuario, foto de avatar y cambio de contraseña
├── dashboard.html          → Panel de control y KPIs de gerencia
├── proyectos.html          → Listado general de proyectos
├── crm.html                → CRM Comercial (embudo comercial estilo Asana con conversión a Proyectos)
├── proyecto-nuevo.html     → Asistente para crear proyecto (importa cotizaciones Excel)
├── proyecto-detalle.html   → Vista integral: Cotización, Costos, Avance, Cortes, Mano de Obra, Documentos
├── facturacion.html        → Control de facturas emitidas y pendientes
├── compras.html            → Compras, materiales y costos de proyectos
├── suministros.html        → Catálogo de ventas de suministros
├── clientes.html           → Directorio de clientes
├── contratistas.html       → Directorio de contratistas y cuadrillas
├── proveedores.html        → Directorio de proveedores
├── empresas.html           → Gestión de empresas ejecutoras
├── usuarios.html           → Control de usuarios y asignación de roles (super_usuario)
├── assets/
│   ├── js/config.js        → Configuración cliente (generada en build o local)
│   ├── js/supabaseClient.js → Inicialización segura del cliente Supabase
│   ├── js/util.js          → Formato de moneda, fechas y sanitización HTML
│   └── js/proy/            → Módulos específicos de proyectos (avance, cortes, mano de obra, etc.)
├── sql/
│   ├── schema.sql          → Esquema completo de la base de datos con políticas RLS
│   └── migracion_*.sql     → Scripts de actualización incremental
├── .github/workflows/
│   └── ci.yml              → Integración continua (lint, test, build)
├── vercel.json             → Configuración de despliegue, cleanUrls y cabeceras de seguridad
├── package.json            → Scripts de build, lint y test
└── .env.example            → Plantilla para variables de entorno
```

---

## 🗄️ Base de Datos (Supabase)

Si configuras una base de datos nueva:
1. Abre tu proyecto en Supabase → **SQL Editor**.
2. Ejecuta `sql/schema.sql`.

Si ya tienes una base de datos existente (o tras montar `schema.sql`), ejecuta las migraciones en este orden recomendado:
1. `sql/migracion_2026-10_cotizacion.sql`
2. `sql/migracion_2026-10_fase2.sql`
3. `sql/migracion_2026-10_crm.sql`
4. `sql/migracion_2026-10_seguridad_rls.sql`
5. `sql/migracion_2026-10_seguridad_crm_completa.sql`
6. `sql/migracion_2026-11_reunion.sql`
7. `sql/migracion_2026-11_seguridad_indices.sql`
8. `sql/migracion_2026-11_rpc_consecutivos_vistas.sql` *(secuencias atómicas `seq_compras_solicitud` / `seq_compras_orden`, RPCs transaccionales `rpc_siguiente_consecutivo`, `rpc_proyecto_finanzas`, `rpc_dashboard_resumen`, `rpc_convertir_oportunidad_a_proyecto` y hardening `SECURITY DEFINER` de `recalcular_proyecto`)*
