import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { HttpError, type Db, type Deps, type MpAccount } from './core';
import { mpFetch, type InboxRow } from './mp';

/** Conexión real: Supabase con la clave de servicio (nunca llega al navegador) + variables de entorno de Vercel. */

function env(name: string): string {
  return process.env[name] ?? '';
}

let admin: SupabaseClient | null = null;
function supabaseAdmin(): SupabaseClient {
  const url = env('SUPABASE_URL') || env('EXPO_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new HttpError(503, 'El servidor no tiene configurado Supabase');
  admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

class SupabaseDb implements Db {
  constructor(private s: SupabaseClient) {}
  async isPro(userId: string) {
    return Boolean(check(await this.s.rpc('is_pro', { p_user: userId })));
  }
  async getProUntil(userId: string) {
    const row = check(await this.s.from('profiles').select('pro_until').eq('user_id', userId).maybeSingle()) as { pro_until: string | null } | null;
    return row?.pro_until ?? null;
  }
  async setPro(userId: string, proUntil: string, preapprovalId: string) {
    check(await this.s.from('profiles').upsert({ user_id: userId, pro_until: proUntil, mp_preapproval_id: preapprovalId }, { onConflict: 'user_id' }));
  }
  async saveMpAccount(acc: Parameters<Db['saveMpAccount']>[0]) {
    check(await this.s.from('mp_accounts').upsert(acc, { onConflict: 'user_id' }));
  }
  async getMpAccount(userId: string) {
    return check(await this.s.from('mp_accounts').select('*').eq('user_id', userId).maybeSingle()) as MpAccount | null;
  }
  async listMpAccounts(limit: number) {
    return check(await this.s.from('mp_accounts').select('*').order('last_synced_at', { ascending: true, nullsFirst: true }).limit(limit)) as MpAccount[];
  }
  async updateMpAccount(userId: string, patch: Partial<Omit<MpAccount, 'user_id'>>) {
    check(await this.s.from('mp_accounts').update(patch).eq('user_id', userId));
  }
  async insertInbox(rows: InboxRow[]) {
    const inserted = check(
      await this.s.from('mp_inbox').upsert(rows, { onConflict: 'user_id,mp_payment_id', ignoreDuplicates: true }).select('id'),
    ) as { id: string }[] | null;
    return inserted?.length ?? 0;
  }
}

export function deps(): Deps {
  const appUrl = (env('APP_URL') || env('EXPO_PUBLIC_APP_URL') || (env('VERCEL_PROJECT_PRODUCTION_URL') ? `https://${env('VERCEL_PROJECT_PRODUCTION_URL')}` : '')).replace(/\/$/, '');
  return {
    db: new SupabaseDb(supabaseAdmin()),
    mp: mpFetch,
    env: {
      appUrl,
      mpAccessToken: env('MP_ACCESS_TOKEN'),
      mpClientId: env('MP_CLIENT_ID'),
      mpClientSecret: env('MP_CLIENT_SECRET'),
      stateSecret: env('APP_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY'),
      priceArs: { month: Number(env('PLUS_PRICE_ARS_MONTH')) || 0, year: Number(env('PLUS_PRICE_ARS_YEAR')) || 0 },
    },
  };
}

/** Usuario de la sesión de Supabase que manda la app (Authorization: Bearer <token>). */
export async function requireUser(request: Request): Promise<{ id: string; email: string | null }> {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
  if (!token) throw new HttpError(401, 'Necesitás iniciar sesión');
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'La sesión venció, volvé a entrar');
  return { id: data.user.id, email: data.user.email ?? null };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Envuelve una función: errores conocidos → su código; el resto → 500 sin filtrar detalles. */
export function route(fn: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await fn(request);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Algo salió mal. Probá de nuevo en un rato.' }, 500);
    }
  };
}
