import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Pool, PoolClient } from 'pg';

/**
 * Un PostgREST mínimo sobre un Postgres local, con lo justo que usa `SupabaseRemote`:
 * select con filtros eq/gt/in, orden y paginado; insert/upsert; update; y rpc.
 * Corre cada pedido como el rol `authenticated` con el `sub` del token, igual que Supabase,
 * así las políticas RLS y las funciones SQL se prueban de verdad.
 */
export async function startEmulator(pool: Pool, port = 0): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    // CORS, para poder apuntar la app web a este servidor.
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      const out = req.url?.startsWith('/auth/v1/') ? await auth(pool, req) : await handle(pool, req);
      res.writeHead(out.status, { 'content-type': 'application/json' });
      res.end(out.body === undefined ? '' : JSON.stringify(out.body));
    } catch (e) {
      const err = e as { message: string; code?: string };
      res.writeHead(err.code === '42501' ? 403 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: err.message, code: err.code ?? 'EMU', details: null, hint: null }));
    }
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actual } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${actual}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

/**
 * Login de mentira con el mismo contrato que Supabase Auth para email + código:
 * /otp siempre "manda" el mail y /verify acepta el código 123456.
 */
async function auth(pool: Pool, req: IncomingMessage): Promise<{ status: number; body?: unknown }> {
  const path = new URL(req.url ?? '/', 'http://x').pathname.replace('/auth/v1/', '');
  const body = ((await readBody(req)) ?? {}) as { email?: string; token?: string };
  if (path === 'otp') return { status: 200, body: {} };
  if (path === 'logout') return { status: 204 };
  if (path === 'verify') {
    if (body.token !== '123456') return { status: 403, body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } };
    const email = String(body.email).toLowerCase();
    const found = await pool.query('select id from auth.users where email = $1', [email]);
    const id = found.rows[0]?.id ?? (await pool.query('insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id', [email])).rows[0].id;
    const user = { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const access = `x.${Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url')}.x`;
    return {
      status: 200,
      body: { access_token: access, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user },
    };
  }
  throw new Error(`auth no soportado: ${path}`);
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (name: string) => {
  if (!IDENT.test(name)) throw new Error(`identificador inválido: ${name}`);
  return `"${name}"`;
};

function subject(req: IncomingMessage): string | null {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).sub ?? null;
  } catch {
    return null;
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : undefined;
}

async function asUser<T>(pool: Pool, sub: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(sub ? 'set local role authenticated' : 'set local role anon');
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [sub ?? '']);
    const result = await fn(c);
    await c.query('commit');
    return result;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);

function where(params: URLSearchParams, values: unknown[]): string {
  const parts: string[] = [];
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    if (op === 'eq') {
      values.push(value);
      parts.push(`${ident(key)}::text = $${values.length}::text`);
    } else if (op === 'gt') {
      values.push(value);
      parts.push(`${ident(key)} > $${values.length}`);
    } else if (op === 'in') {
      const list = value.replace(/^\(|\)$/g, '').split(',').filter(Boolean);
      values.push(list);
      parts.push(`${ident(key)}::text = any($${values.length}::text[])`);
    } else throw new Error(`filtro no soportado: ${key}=${raw}`);
  }
  return parts.length ? `where ${parts.join(' and ')}` : '';
}

function columns(select: string | null): string {
  if (!select || select === '*') return '*';
  return select.split(',').map((c) => ident(c.trim())).join(', ');
}

async function handle(pool: Pool, req: IncomingMessage): Promise<{ status: number; body?: unknown }> {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname.replace(/^\/rest\/v1\//, '');
  const sub = subject(req);
  const params = url.searchParams;
  const single = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
  const wantsRows = String(req.headers.prefer ?? '').includes('return=representation');
  const body = await readBody(req);

  if (path.startsWith('rpc/')) {
    const fn = path.slice(4);
    return asUser(pool, sub, async (c) => {
      const meta = await c.query(
        `select p.proretset as set, t.typname as type from pg_proc p join pg_type t on t.oid = p.prorettype
         where p.proname = $1 and p.pronamespace = 'public'::regnamespace`,
        [fn],
      );
      if (meta.rowCount !== 1) throw new Error(`función desconocida: ${fn}`);
      const args = Object.entries((body ?? {}) as Record<string, unknown>);
      const call = `public.${ident(fn)}(${args.map(([k], i) => `${ident(k)} := $${i + 1}`).join(', ')})`;
      const values = args.map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
      if (meta.rows[0].set) return { status: 200, body: (await c.query(`select to_jsonb(r) as j from ${call} r`, values)).rows.map((r) => r.j) };
      if (meta.rows[0].type === 'void') {
        await c.query(`select ${call}`, values);
        return { status: 204 };
      }
      return { status: 200, body: (await c.query(`select to_jsonb(${call}) as j`, values)).rows[0].j };
    });
  }

  const table = `public.${ident(path)}`;
  return asUser(pool, sub, async (c) => {
    if (req.method === 'GET') {
      const values: unknown[] = [];
      let sql = `select ${columns(params.get('select'))} from ${table} ${where(params, values)}`;
      const order = params.get('order');
      if (order) {
        sql += ` order by ${order
          .split(',')
          .map((o) => {
            const [col, dir] = o.split('.');
            return `${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}`;
          })
          .join(', ')}`;
      }
      if (params.get('limit')) sql += ` limit ${Number(params.get('limit'))}`;
      if (params.get('offset')) sql += ` offset ${Number(params.get('offset'))}`;
      const rows = (await c.query(`select to_jsonb(q) as j from (${sql}) q`, values)).rows.map((r) => r.j);
      return { status: 200, body: single ? rows[0] : rows };
    }

    if (req.method === 'POST') {
      const rows = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
      const cols = params.get('columns')?.split(',').map((c) => c.replace(/"/g, '')) ?? Object.keys(rows[0] ?? {});
      const list = cols.map(ident).join(', ');
      let sql = `insert into ${table} as t (${list}) select ${list} from jsonb_populate_recordset(null::${table}, $1::jsonb)`;
      const conflict = params.get('on_conflict');
      if (conflict && String(req.headers.prefer).includes('resolution=merge-duplicates')) {
        const updates = cols.filter((c) => c !== conflict).map((c) => `${ident(c)} = excluded.${ident(c)}`);
        sql += ` on conflict (${ident(conflict)}) do update set ${updates.join(', ')}`;
      }
      sql += ' returning to_jsonb(t.*) as j';
      const inserted = (await c.query(sql, [JSON.stringify(rows)])).rows.map((r) => r.j as Record<string, unknown>);
      if (!wantsRows) return { status: 201 };
      const picked = params.get('select') && params.get('select') !== '*'
        ? inserted.map((r) => Object.fromEntries(params.get('select')!.split(',').map((k) => [k, r[k]])))
        : inserted;
      return { status: 201, body: single ? picked[0] : picked };
    }

    if (req.method === 'PATCH') {
      const values: unknown[] = [JSON.stringify(body)];
      const cols = Object.keys(body as object);
      const sets = cols.map((col) => `${ident(col)} = (jsonb_populate_record(null::${table}, $1::jsonb)).${ident(col)}`);
      await c.query(`update ${table} set ${sets.join(', ')} ${where(params, values)}`, values);
      return { status: 204 };
    }

    throw new Error(`método no soportado: ${req.method}`);
  });
}
