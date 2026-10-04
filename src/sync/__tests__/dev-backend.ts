/**
 * Backend local para probar la app web con sincronización sin Supabase:
 *   PAREJO_TEST_PG=postgres://... npx tsx src/sync/__tests__/dev-backend.ts 54321
 * Crea una base nueva con las migraciones y levanta el emulador en el puerto dado.
 * Para entrar en la app, cualquier email y el código 123456.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client, Pool } from 'pg';

import { startEmulator } from './pgrest-emulator';

async function main() {
  const admin = process.env.PAREJO_TEST_PG;
  if (!admin) throw new Error('Falta PAREJO_TEST_PG');
  const port = Number(process.argv[2] ?? 54321);
  const root = join(__dirname, '../../..');
  const dbName = 'parejo_dev';
  const c = new Client({ connectionString: admin });
  await c.connect();
  await c.query(`drop database if exists ${dbName} with (force)`);
  await c.query(`create database ${dbName}`);
  await c.end();
  const url = new URL(admin);
  url.pathname = `/${dbName}`;
  const pool = new Pool({ connectionString: url.toString() });
  await pool.query('set client_min_messages = warning');
  await pool.query(readFileSync(join(root, 'supabase/tests/supabase_stub.sql'), 'utf8'));
  for (const f of readdirSync(join(root, 'supabase/migrations')).sort()) {
    await pool.query(readFileSync(join(root, 'supabase/migrations', f), 'utf8'));
  }
  const emu = await startEmulator(pool, port);
  console.log(`Backend de prueba en ${emu.url}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
