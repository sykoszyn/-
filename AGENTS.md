This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Parejo — notas del proyecto

- La lógica de negocio vive en `src/domain` (TypeScript puro, sin React). Todo cálculo de plata va ahí y lleva test en `src/domain/__tests__` (`npm test`, con vitest).
- Montos siempre en centavos enteros; repartir con `allocate()` para no perder centavos.
- Estado global en `src/store` (zustand + AsyncStorage). Las pantallas leen el grupo activo con `useGroup()`.
- Toda acción del store que cambia un grupo pasa a `mutate()` la lista de filas tocadas (`[tabla, id, borrado?]`): así se sincroniza. Si sumás un campo, actualizá `src/sync/mappers.ts` y una migración nueva en `supabase/migrations/` (nunca editar una ya corrida).
- `src/sync/engine.ts` no depende de React ni de Supabase: se prueba con `FakeServer` (`src/sync/__tests__`). Con `PAREJO_TEST_PG` también corre la prueba contra Postgres real.
- Parejo Plus: precios, prueba y límites en `src/domain/plan.ts` (`PLUS`, `FREE_LIMITS`); en pantallas usar `usePlan(group)`, `hasPlus(plan)` y `goPlus(feature)`. En la base sigue llamándose `pro_until`/`is_pro` (no renombrar columnas ya creadas).
- `api/` son funciones de Vercel (firma Web `Request`/`Response`). La lógica va en `api/_lib/core.ts` con dependencias inyectadas y tests en `api/_lib/__tests__`; nunca usar la service role key fuera de `api/`.
- UI: usar los componentes de `src/ui` y los colores de `useTheme()`; no hardcodear colores.
- Textos de la app en español rioplatense (vos).
- Antes de terminar: `npm run check`.
- En entornos sin acceso a la API de Expo, usar `EXPO_OFFLINE=1` con `npx expo install` / `npx expo lint`.
