# Web instalable en Vercel + Parejo Pro + Mercado Pago

Mientras la app no esté en las tiendas, la web **es** la app: se publica en Vercel, se instala en el celular desde el navegador (PWA) y cobra Pro con Mercado Pago.

## 1. Publicar en Vercel

1. Subí el repo a GitHub (ya está) y en [vercel.com/new](https://vercel.com/new) importalo.
2. Vercel lee `vercel.json`: compila con `npx expo export -p web`, publica `dist/` y las funciones de `api/`. No hace falta tocar nada más en la pantalla de import.
3. Cargá las variables de entorno (*Settings → Environment Variables*) de la tabla de abajo y hacé **Redeploy**.
4. (Opcional) Conectá tu dominio, por ejemplo `parejo.app`, y usalo en `EXPO_PUBLIC_APP_URL` / `APP_URL`.

| Variable | Para qué | Dónde se consigue |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Conexión de la app | Supabase → Project Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Conexión de la app (pública) | Supabase → Project Settings → API |
| `EXPO_PUBLIC_APP_URL` | Links de invitación y vuelta de Mercado Pago | Tu dominio, ej. `https://parejo.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor.** Activar Pro y guardar pagos | Supabase → Project Settings → API (service_role). Nunca en variables `EXPO_PUBLIC_*` |
| `APP_SECRET` | Firmar la conexión con Mercado Pago | Cualquier texto largo al azar (`openssl rand -hex 32`) |
| `MP_ACCESS_TOKEN` | Crear suscripciones | Mercado Pago Developers → tu aplicación → Credenciales de producción |
| `PRO_PRICE_ARS` | Precio anual en pesos que cobra Mercado Pago | Vos (ej. `42000`); actualizalo cuando cambie el dólar |
| `MP_WEBHOOK_SECRET` | Verificar los avisos de Mercado Pago | Tu aplicación → Webhooks → Clave secreta |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | Conectar la cuenta de cada usuario (OAuth) | Tu aplicación → Credenciales |
| `CRON_SECRET` | Que solo Vercel pueda correr la sincronización diaria | Texto al azar; Vercel lo manda solo al cron |

> Ojo: el plan gratis de Vercel (Hobby) es para uso no comercial y permite un cron por día. Para cobrar suscripciones, pasá a Vercel Pro.

### App instalable (PWA)
- `public/manifest.webmanifest`, íconos en `public/icons/` y `public/sw.js` (funciona sin conexión: guarda la app y los archivos estáticos; los datos siempre van a la red).
- **Android / Chrome / Edge:** aparece el botón **Instalar** en el inicio de la app (y el del navegador).
- **iPhone:** Safari → Compartir → *Agregar a inicio*. La app muestra esas instrucciones una vez.
- Atajos desde el ícono: *Cargar gasto* y *Saldar*.

## 2. Base de datos

Corré [`supabase/migrations/003_pro.sql`](../supabase/migrations/003_pro.sql) en el SQL Editor de Supabase (después de la 001 y la 002). Agrega:
- Etiquetas en los gastos y la tabla de presupuestos (sincronizadas como el resto).
- `profiles`: prueba gratis y Pro de cada persona. Nadie se lo puede dar a mano: lo escriben `start_trial()` y el servidor.
- `plan_status()`: el plan propio y el de cada grupo. **Pro es para los dos:** si alguien del grupo lo tiene, todo el grupo lo usa.
- Mercado Pago: `mp_accounts` (tokens, que la app no puede leer) y `mp_inbox` (la bandeja; desde la app solo se puede marcar *cargado* o *descartado*).

## 3. Mercado Pago

En [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel/app) creá una aplicación y:

1. **Suscripciones (cobrar Pro).** Copiá el *Access Token* de producción en `MP_ACCESS_TOKEN` y definí `PRO_PRICE_ARS`.
   En *Webhooks*, poné `https://TU-DOMINIO/api/mp/webhook` con los eventos de **Planes y suscripciones**, y copiá la clave secreta en `MP_WEBHOOK_SECRET`.
   Cómo funciona: la app pide `/api/mp/subscribe` → Mercado Pago cobra → avisa al webhook → el servidor **vuelve a consultar la suscripción a Mercado Pago** (no le cree al aviso) y activa Pro hasta el próximo cobro.
2. **Conectar la cuenta (pagos que entran solos).** En la aplicación configurá la URL de redirección `https://TU-DOMINIO/api/mp/callback` y copiá `MP_CLIENT_ID` / `MP_CLIENT_SECRET`.
   Cada persona con Pro toca *Conectar Mercado Pago* en Ajustes; desde ahí, una vez por día (y cuando tocan *Traer pagos ahora*) el servidor trae los pagos aprobados de los últimos 30 días a la **bandeja**. Ahí cada uno elige: *Cargar como gasto*, *Es Sofi saldando* (para cobros) o *No es compartido*. Nada se suma a las cuentas sin confirmar.

> **A verificar con tu cuenta real.** Desde acá no pude conectarme a Mercado Pago. La búsqueda de pagos (`/v1/payments/search`) devuelve seguro lo que la cuenta **cobra** (transferencias recibidas, ventas). Que también devuelva los pagos que la persona **hace** (QR, link de pago, débitos) depende de lo que habilite Mercado Pago para tu aplicación. Si en Kesef lo resolviste de otra forma, el resto ya está listo: solo cambia `syncAccount` en `api/_lib/core.ts`.

## 4. Qué incluye cada plan

| | Gratis | Pro (USD 35/año, 14 días de prueba sin tarjeta) |
| --- | --- | --- |
| Grupos, gastos, cuotas, fijos, metas, saldar, sincronización | ✅ | ✅ |
| Etiquetas | 5 | Sin tope |
| Presupuestos | 2 | Sin tope |
| Carga por voz | 10 por mes | Sin límite |
| Insights detallados (proyección, cuotas comprometidas, tendencias) | Solo el gráfico de 6 meses | ✅ |
| Exportación a Excel | — | ✅ |
| Mercado Pago: pagos que entran solos | — | ✅ |
| Anuncios | No hay en ningún plan | No hay |

Los límites están en `src/domain/plan.ts` (`FREE_LIMITS`, `PRO`). Hoy se controlan en la app; la integración con Mercado Pago además se controla en el servidor.

## 5. Cuando lleguen las tiendas

Apple y Google exigen cobrar las suscripciones digitales **con su propio sistema de pagos** dentro de la app. Por eso, en la versión nativa el botón de suscribirse no aparece (Pro se activa si lo compraste en la web). Para lanzar en las tiendas: sumar compras dentro de la app (por ejemplo con RevenueCat) que escriban el mismo `profiles.pro_until`.

## 6. Probarlo localmente

```bash
PGHOST=localhost PGUSER=postgres npm run test:db                  # SQL: 42 verificaciones (RLS, prueba, Pro compartido, bandeja)
PAREJO_TEST_PG=postgres://postgres@localhost:5432/postgres npm test   # todo, incluido Supabase de punta a punta
```
Las funciones de `api/` tienen tests con Mercado Pago simulado en `api/_lib/__tests__/`.
