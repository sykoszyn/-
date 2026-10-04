# Publicar Parejo en web, Google Play y App Store

Todo sale del mismo código. Se usa **EAS** (el servicio de Expo) para compilar y subir a las tiendas desde la nube, sin necesitar Xcode ni Android Studio.

## 0. Antes de empezar

| Qué | Costo | Dónde |
| --- | --- | --- |
| Cuenta de Expo | Gratis (plan free alcanza para empezar) | https://expo.dev/signup |
| Google Play Console | USD 25, pago único | https://play.google.com/console |
| Apple Developer Program | USD 99 por año | https://developer.apple.com/programs |
| Dominio (opcional) | variable | ej. `parejo.app` |

Además vas a necesitar:
- **Política de privacidad** publicada en una URL (las dos tiendas la piden). Tiene que decir que se guarda el email y los datos de los grupos en Supabase.
- Las variables de Supabase cargadas en EAS (ver [`SINCRONIZACION.md`](SINCRONIZACION.md)).
- **Capturas de pantalla** (`npm run web` + el navegador en tamaño celular sirve para un primer set).
- Revisar el **identificador de la app** en `app.json` (`app.parejo` en iOS y Android). Una vez publicado no se puede cambiar.

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest init      # vincula el proyecto a tu cuenta de Expo
```

## 1. Web

```bash
npm run build:web            # genera la carpeta dist/
```

`dist/` es un sitio estático (SPA). Opciones:
- **EAS Hosting:** `npx eas-cli@latest deploy --prod`
- **Vercel / Netlify / Cloudflare Pages:** subir `dist/` con la regla de que toda ruta sirva `index.html`.

## 2. Android (Google Play)

```bash
npx eas-cli@latest build --platform android --profile preview      # APK para probar en tu celular
npx eas-cli@latest build --platform android --profile production   # AAB para la tienda
npx eas-cli@latest submit --platform android
```

En Play Console: crear la app, completar ficha (descripción, capturas, ícono 512×512, gráfico destacado 1024×500), cuestionario de contenido, seguridad de datos y público objetivo. Empezar por **prueba interna** y después producción. Las cuentas personales nuevas tienen que pasar por una prueba cerrada con testers antes de producción.

## 3. iOS (App Store)

```bash
npx eas-cli@latest build --platform ios --profile production   # EAS crea certificados y perfiles
npx eas-cli@latest submit --platform ios                       # sube a App Store Connect / TestFlight
```

En App Store Connect: ficha, capturas (6,9" y 6,5"), privacidad (email y datos financieros que carga el usuario, vinculados a su cuenta, sin rastreo) y enviar a revisión. Probar primero con **TestFlight**.

> Apple pide que se pueda **borrar la cuenta desde la app** si la app permite crear cuentas. Está en la lista de pendientes.

> Apple rechaza apps que son “una web metida en una app”. Parejo es una app nativa (React Native), así que no tiene ese problema.

## 4. Actualizaciones

- Cambios solo de JavaScript/diseño: `npx eas-cli@latest update` (llegan sin pasar por revisión).
- Cambios nativos (nuevas librerías nativas, permisos, ícono): nuevo `build` + `submit`.

## Checklist de lanzamiento

- [x] Fase 2: cuentas, sincronización e invitaciones.
- [ ] Correr `002_sync.sql`, plantilla de mail con `{{ .Token }}` y SMTP propio (ver `SINCRONIZACION.md`).
- [ ] Borrar la cuenta desde la app (requisito de Apple).
- [ ] Política de privacidad y términos publicados.
- [ ] Ícono y splash definitivos (hoy hay una versión inicial en `assets/images`).
- [ ] Capturas y textos de las tiendas.
- [ ] Probar en un Android y un iPhone reales (`--profile preview` / TestFlight).
- [ ] Analytics y reporte de errores (ej. PostHog + Sentry).
