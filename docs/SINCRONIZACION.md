# Sincronización con Supabase

Con esto, la pareja (o el grupo) ve las mismas cuentas, cada uno desde su celular o la web.

## Cómo funciona

- **Primero el teléfono.** Todo se guarda al instante en el dispositivo y la app funciona sin conexión.
- **Cola de cambios.** Cada cambio en un grupo compartido se anota (`outbox`) y se sube unos segundos después. Si no hay conexión, queda pendiente y se sube cuando vuelve.
- **Traer cambios.** La app pide solo lo que cambió desde la última vez (`updated_at`). Lo hace al abrir la app, cada minuto y **al instante** cuando la otra persona carga algo (Supabase Realtime).
- **Conflictos.** Si dos personas editan el mismo gasto a la vez, queda la última edición que se subió. Un cambio local que todavía no se subió nunca se pisa.
- **Borrados.** Los gastos, pagos, fijos y metas se marcan como borrados (`deleted_at`), así el borrado llega a todos los dispositivos.
- **Invitaciones.** Quien invita genera un link (`/join/<código>`), válido 7 días y de un solo uso. Quien lo abre entra con su email y queda vinculado a "su" persona del grupo, con todo lo que ya estaba cargado.
- **Seguridad.** Las políticas RLS hacen que cada uno vea y edite solo los grupos de los que es parte. Vincular una cuenta a una persona solo se puede hacer con `create_group` / `accept_invite`.

Código: `src/sync/` (motor en `engine.ts`, conexión en `remote-supabase.ts`, en segundo plano `runtime.tsx`). SQL: `supabase/migrations/`.

## Puesta en marcha (una sola vez)

1. **Correr la segunda migración.** En Supabase → *SQL Editor*, pegá y corré [`supabase/migrations/002_sync.sql`](../supabase/migrations/002_sync.sql). (La 001 ya la corriste: era el `schema.sql`.) Se puede correr más de una vez sin problema.

2. **Login con código por email.** En *Authentication → Emails* (plantillas), editá **Magic Link** y **Confirm signup** para que incluyan el código, por ejemplo:

   ```html
   <h2>Tu código para entrar a Parejo</h2>
   <p style="font-size: 28px; letter-spacing: 4px;"><b>{{ .Token }}</b></p>
   <p>Vence en una hora. Si no fuiste vos, ignorá este mail.</p>
   ```

   Sin `{{ .Token }}`, el mail trae solo un link y la app no tiene código para pedir.

3. **Claves en la app.** Copiá `.env.example` como `.env.local` y completá con los datos de *Project Settings → API* (Project URL y la clave `anon` / publishable). Esa clave es pública por diseño: lo que protege los datos son las políticas RLS.

   ```bash
   cp .env.example .env.local
   npm run web
   ```

4. **Para las tiendas (EAS).** Cargá las mismas tres variables `EXPO_PUBLIC_*` en *expo.dev → tu proyecto → Environment variables* (o en `eas.json`, dentro de cada perfil de `build`, en `env`).

5. **Antes de lanzar:** configurá un **SMTP propio** en *Authentication → SMTP Settings* (Resend, Postmark, SES…). El servidor de mails que trae Supabase es solo para probar: manda muy pocos por hora y puede no llegar a direcciones fuera de tu equipo.

## Probarlo sin Supabase (desarrollo)

Con un Postgres local se puede correr todo de punta a punta:

```bash
# Pruebas del SQL (RLS, invitaciones, salir del grupo) con dos usuarios y un intruso
PGHOST=localhost PGUSER=postgres npm run test:db

# El cliente real de Supabase contra las migraciones (emulador de PostgREST)
PAREJO_TEST_PG=postgres://postgres@localhost:5432/postgres npm test

# Un backend falso para usar la app web con sincronización (login con cualquier email y el código 123456)
PAREJO_TEST_PG=postgres://postgres@localhost:5432/postgres npm run dev:backend -- 54321
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=dev npm run web
```

El backend falso no tiene tiempo real; los cambios del otro aparecen al volver a la app o al minuto.

## Pendiente

- **Links que abren la app instalada** (universal links / app links). Hoy el link de invitación abre la web, que funciona igual; en el celular también se puede pegar el código en *Me invitaron a un grupo*.
- Iniciar sesión con Google y Apple.
- Notificaciones push ("Sofi cargó Súper $45.000", "mañana vence la luz").
