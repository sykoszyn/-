import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { currentMonth } from '@/domain/dates';
import { balances } from '@/domain/ledger';

import { joinWithInvite, leaveGroup, syncAll, uploadGroup } from '../engine';
import { SupabaseRemote } from '../remote-supabase';
import { device, expense, legacyGroup } from './helpers';
import { startEmulator } from './pgrest-emulator';

/**
 * Prueba de punta a punta: el cliente real de Supabase → un PostgREST emulado → Postgres
 * con las migraciones de `supabase/migrations` y sus políticas RLS.
 * Necesita un Postgres local: PAREJO_TEST_PG=postgres://postgres@localhost:5432/postgres
 */
const ADMIN = process.env.PAREJO_TEST_PG;
const ROOT = join(__dirname, '../../..');

const USERS = {
  juli: '00000000-0000-4000-8000-00000000000a',
  sofi: '00000000-0000-4000-8000-00000000000b',
  intruso: '00000000-0000-4000-8000-00000000000c',
};

const token = (sub: string) => `x.${Buffer.from(JSON.stringify({ sub, role: 'authenticated' })).toString('base64url')}.x`;

class TestRemote extends SupabaseRemote {
  constructor(
    url: string,
    private uid: string,
  ) {
    super(
      createClient(url, 'anon-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token(uid)}` } },
      }),
    );
  }
  async userId() {
    return this.uid;
  }
}

describe.skipIf(!ADMIN)('Supabase de punta a punta (Postgres local)', () => {
  const dbName = `parejo_e2e_${process.pid}`;
  let pool: Pool;
  let emulator: Awaited<ReturnType<typeof startEmulator>>;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    await admin.end();
    const url = new URL(ADMIN!);
    url.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: url.toString() });
    await pool.query('set client_min_messages = warning');
    await pool.query(readFileSync(join(ROOT, 'supabase/tests/supabase_stub.sql'), 'utf8'));
    for (const f of readdirSync(join(ROOT, 'supabase/migrations')).sort()) {
      await pool.query(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'));
    }
    for (const [name, id] of Object.entries(USERS)) await pool.query('insert into auth.users (id, email) values ($1, $2)', [id, `${name}@example.com`]);
    emulator = await startEmulator(pool);
  });

  afterAll(async () => {
    await emulator?.close();
    await pool?.end();
    const admin = new Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  });

  it('una pareja comparte, edita y borra; un intruso no ve nada', async () => {
    const juli = device(new TestRemote(emulator.url, USERS.juli));
    const sofi = device(new TestRemote(emulator.url, USERS.sofi));
    const intruso = new TestRemote(emulator.url, USERS.intruso);

    // Juli sube su grupo (con ids viejos) e invita a Sofi.
    juli.add(legacyGroup());
    const groupId = await uploadGroup(juli.deps, juli.state.activeGroupId!);
    const sofiMember = juli.group.members.find((m) => m.name === 'Sofi')!;
    const code = await juli.deps.remote.createInvite(groupId, sofiMember.id);

    const preview = await sofi.deps.remote.previewInvite(code);
    expect(preview).toMatchObject({ groupName: juli.group.name, memberName: 'Sofi', inviterName: 'Juli', status: 'ok' });

    await joinWithInvite(sofi.deps, code);
    expect(sofi.group.meId).toBe(sofiMember.id);
    expect(balances(sofi.group, currentMonth())).toEqual(balances(juli.group, currentMonth()));
    expect(sofi.group.goals[0].contributions).toHaveLength(1);

    // Juli carga una compra en dólares y en cuotas; Sofi la recibe idéntica.
    const airbnb = expense(juli.group, { description: 'Airbnb', amount: 320_00, currency: 'USD', rate: 1250.5, installments: 3, split: { mode: 'income' } });
    juli.mutate((g) => ({ ...g, expenses: [...g.expenses, airbnb] }), [['expenses', airbnb.id]]);
    await syncAll(juli.deps);
    await syncAll(sofi.deps);
    const received = sofi.group.expenses.find((e) => e.id === airbnb.id);
    expect(received).toMatchObject({ amount: 320_00, currency: 'USD', rate: 1250.5, installments: 3, split: { mode: 'income' } });

    // Sofi borra un gasto y salda; Juli lo ve.
    const victim = sofi.group.expenses[0];
    sofi.mutate((g) => ({ ...g, expenses: g.expenses.filter((e) => e.id !== victim.id) }), [['expenses', victim.id, true]]);
    await syncAll(sofi.deps);
    await syncAll(juli.deps);
    expect(juli.group.expenses.some((e) => e.id === victim.id)).toBe(false);
    expect(balances(juli.group, currentMonth())).toEqual(balances(sofi.group, currentMonth()));

    // El intruso no puede ni leer ni escribir.
    expect(await intruso.myGroupIds()).toEqual([]);
    await expect(intruso.acceptInvite(code)).rejects.toThrow(/ya se usó/);
    const snap = await intruso.pull(groupId, null);
    expect(Object.values(snap).every((rows) => rows.length === 0)).toBe(true);
    await expect(intruso.upsert('expenses', [{ id: airbnb.id, group_id: groupId, description: 'hack' } as never])).rejects.toThrow();

    // Sofi se va: sigue en las cuentas de Juli, pero ya no ve el grupo.
    await leaveGroup(sofi.deps, groupId);
    await syncAll(juli.deps);
    expect(juli.group.members.find((m) => m.id === sofiMember.id)?.userId).toBeUndefined();
    expect(await sofi.deps.remote.myGroupIds()).toEqual([]);
  });

  it('trae solo lo nuevo y pagina sin perder filas', async () => {
    const juli = device(new TestRemote(emulator.url, USERS.juli));
    juli.add({ ...legacyGroup(), id: 'g-pagination', expenses: [] });
    const groupId = await uploadGroup(juli.deps, 'g-pagination');
    const many = Array.from({ length: 1205 }, (_, i) => expense(juli.group, { description: `Gasto ${i}`, amount: 100 + i }));
    juli.mutate((g) => ({ ...g, expenses: many }), many.map((e) => ['expenses', e.id] as ['expenses', string]));
    await syncAll(juli.deps);

    const tablet = device(new TestRemote(emulator.url, USERS.juli));
    await syncAll(tablet.deps);
    expect(tablet.state.groups[groupId].expenses).toHaveLength(1205);

    // Una segunda sincronización trae poco (solo el margen de seguridad), no todo de nuevo.
    const remote = tablet.deps.remote as TestRemote;
    const pulled = await remote.pull(groupId, new Date(Date.now() + 60_000).toISOString());
    expect(pulled.expenses).toHaveLength(0);
  });
});
