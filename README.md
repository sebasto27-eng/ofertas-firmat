# Ofertas Firmat

Mapa de descuentos y promociones de los comercios de Firmat, Santa Fe.

- **Público:** ve en el mapa los comercios con ofertas, filtra por rubro y descuento, y toca **Cómo llegar** para abrir la ruta en Google Maps.
- **Comercios:** crean su cuenta con email y contraseña, marcan su local en el mapa y cargan, editan o borran sus ofertas. Cada comercio solo puede tocar lo suyo.
- Las ofertas vencidas desaparecen solas del mapa.

Sin la base de datos conectada, la app funciona en **modo demostración** con comercios de ejemplo.

## Cómo está hecha

| Parte | Herramienta | Costo |
|---|---|---|
| Mapa | [Leaflet](https://leafletjs.com) + calles de OpenStreetMap | Gratis |
| Cuentas y base de datos | [Supabase](https://supabase.com) | Plan gratis |
| Hosting | [Vercel](https://vercel.com) | Plan gratis |

Es un sitio estático (HTML, CSS y JavaScript), sin paso de compilación.

```
index.html          la página
styles.css          diseño
app.js              lógica (mapa, filtros, cuentas, ofertas)
config.js           datos de conexión a Supabase  ← completar
supabase/schema.sql tablas y reglas de seguridad   ← pegar en Supabase
```

## Paso 1: crear la base de datos en Supabase

1. Entrá a [supabase.com](https://supabase.com), creá una cuenta y tocá **New project**. Nombre: `ofertas-firmat`; región: **South America (São Paulo)**. Guardá la contraseña de la base que te pide.
2. Cuando termine de crearse, andá a **SQL Editor → New query**, pegá todo el contenido de `supabase/schema.sql` y tocá **Run**. Tiene que decir *Success*.
3. Andá a **Project Settings → API** (o **Data API / API Keys**) y copiá:
   - **Project URL** (ej: `https://abcd1234.supabase.co`)
   - **anon / publishable key** (empieza con `eyJ…` o `sb_publishable_…`)
4. Pegá esos dos valores en `config.js`. La *anon key* es pública: se puede subir a GitHub. **Nunca** pongas la *service_role / secret key*.

## Paso 2: configurar los mails de las cuentas

En Supabase, **Authentication → URL Configuration**:

- **Site URL:** la dirección de la app en Vercel (ej: `https://ofertas-firmat.vercel.app`).
- **Redirect URLs:** agregá esa misma dirección.

Así los enlaces de "confirmá tu cuenta" y "olvidé mi contraseña" llevan a la app.

Por defecto Supabase pide confirmar el email al registrarse. Si querés que los comercios entren sin confirmar: **Authentication → Sign In / Providers → Email → Confirm email** desactivado. El servicio de mails gratis de Supabase manda pocos mails por hora; para muchos registros conviene configurar un SMTP propio (Authentication → Emails → SMTP).

## Paso 3: subir a GitHub y publicar en Vercel

1. Subí esta carpeta a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importá el repositorio.
3. Framework: **Other**. No hace falta *build command*. Tocá **Deploy**.
4. Cada vez que se suba un cambio a GitHub, Vercel actualiza la app sola.

## Probar en tu computadora

Abrí `index.html` en el navegador. Para que funcione "Mi ubicación" hace falta abrirla desde `https://` (Vercel) o desde un servidor local:

```bash
npx serve .
```

## Moderación

Desde Supabase → **Table Editor** podés ver, editar o borrar cualquier comercio u oferta.
