import {
  authorizeUrl,
  paymentToInbox,
  preapprovalBody,
  proUntilFor,
  signState,
  verifyState,
  type InboxRow,
  type MpFetch,
  type MpPayment,
  type OAuthToken,
  type Period,
  type Preapproval,
} from './mp';

/** Lo que las funciones necesitan de la base (Supabase con la clave de servicio). */
export interface Db {
  isPro(userId: string): Promise<boolean>;
  getProUntil(userId: string): Promise<string | null>;
  setPro(userId: string, proUntil: string, preapprovalId: string): Promise<void>;
  saveMpAccount(acc: { user_id: string; mp_user_id: number; access_token: string; refresh_token: string | null; expires_at: string | null }): Promise<void>;
  getMpAccount(userId: string): Promise<MpAccount | null>;
  listMpAccounts(limit: number): Promise<MpAccount[]>;
  updateMpAccount(userId: string, patch: Partial<Omit<MpAccount, 'user_id'>>): Promise<void>;
  insertInbox(rows: InboxRow[]): Promise<number>;
}

export type MpAccount = {
  user_id: string;
  mp_user_id: number;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  last_synced_at: string | null;
};

export type Env = {
  appUrl: string;
  mpAccessToken: string;
  mpClientId: string;
  mpClientSecret: string;
  stateSecret: string;
  /** Precio en pesos de cada opción (lo que cobra Mercado Pago). */
  priceArs: Record<Period, number>;
};

export type Deps = { db: Db; mp: MpFetch; env: Env; now?: () => Date };

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const now = (d: Deps) => (d.now ? d.now() : new Date());

/** Crea la suscripción (mensual o anual) en Mercado Pago y devuelve el link de pago. */
export async function createSubscription(d: Deps, user: { id: string; email: string | null }, period: unknown): Promise<string> {
  if (period !== 'month' && period !== 'year') throw new HttpError(400, 'Elegí mensual o anual');
  if (!user.email) throw new HttpError(400, 'Tu cuenta no tiene email');
  const priceArs = d.env.priceArs[period];
  if (!d.env.mpAccessToken || !priceArs) throw new HttpError(503, 'Los pagos todavía no están configurados');
  const pre = (await d.mp('/preapproval', {
    method: 'POST',
    token: d.env.mpAccessToken,
    body: preapprovalBody({ userId: user.id, email: user.email, period, priceArs, appUrl: d.env.appUrl }),
  })) as { init_point?: string };
  if (!pre.init_point) throw new HttpError(502, 'Mercado Pago no devolvió el link de pago');
  return pre.init_point;
}

/**
 * Aviso de Mercado Pago sobre una suscripción. Nunca se confía en el contenido del aviso:
 * se vuelve a consultar la suscripción con nuestro token y se actualiza el plan con eso.
 */
export async function handleSubscriptionWebhook(d: Deps, type: string, dataId: string): Promise<'updated' | 'ignored'> {
  let preapprovalId = dataId;
  if (type === 'subscription_authorized_payment') {
    const payment = (await d.mp(`/authorized_payments/${encodeURIComponent(dataId)}`, { token: d.env.mpAccessToken })) as { preapproval_id?: string };
    if (!payment.preapproval_id) return 'ignored';
    preapprovalId = payment.preapproval_id;
  } else if (type !== 'subscription_preapproval') {
    return 'ignored';
  }
  const pre = (await d.mp(`/preapproval/${encodeURIComponent(preapprovalId)}`, { token: d.env.mpAccessToken })) as Preapproval;
  const userId = pre.external_reference;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return 'ignored';
  const until = proUntilFor(pre, now(d), await d.db.getProUntil(userId));
  if (!until) return 'ignored';
  await d.db.setPro(userId, until, pre.id);
  return 'updated';
}

export async function connectUrl(d: Deps, userId: string): Promise<string> {
  if (!d.env.mpClientId) throw new HttpError(503, 'La conexión con Mercado Pago todavía no está configurada');
  if (!(await d.db.isPro(userId))) throw new HttpError(402, 'La conexión con Mercado Pago viene con Parejo Plus');
  return authorizeUrl({ clientId: d.env.mpClientId, redirectUri: `${d.env.appUrl}/api/mp/callback`, state: signState(userId, d.env.stateSecret, now(d).getTime()) });
}

/** Vuelta del OAuth: canjea el código por tokens y deja la cuenta conectada. Devuelve a dónde redirigir. */
export async function finishConnect(d: Deps, code: string | null, state: string | null): Promise<string> {
  const back = (status: string) => `${d.env.appUrl}/settings?mp=${status}`;
  const userId = state ? verifyState(state, d.env.stateSecret, now(d).getTime()) : null;
  if (!code || !userId) return back('error');
  const token = (await d.mp('/oauth/token', {
    method: 'POST',
    token: d.env.mpAccessToken,
    body: {
      client_id: d.env.mpClientId,
      client_secret: d.env.mpClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${d.env.appUrl}/api/mp/callback`,
    },
  })) as OAuthToken;
  await d.db.saveMpAccount({
    user_id: userId,
    mp_user_id: token.user_id,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    expires_at: token.expires_in ? new Date(now(d).getTime() + token.expires_in * 1000).toISOString() : null,
  });
  await syncAccount(d, (await d.db.getMpAccount(userId))!).catch(() => 0);
  return back('ok');
}

async function freshToken(d: Deps, acc: MpAccount): Promise<string> {
  const soon = now(d).getTime() + 7 * 86_400_000;
  if (!acc.expires_at || Date.parse(acc.expires_at) > soon || !acc.refresh_token) return acc.access_token;
  const token = (await d.mp('/oauth/token', {
    method: 'POST',
    token: d.env.mpAccessToken,
    body: { client_id: d.env.mpClientId, client_secret: d.env.mpClientSecret, grant_type: 'refresh_token', refresh_token: acc.refresh_token },
  })) as OAuthToken;
  const expires_at = token.expires_in ? new Date(now(d).getTime() + token.expires_in * 1000).toISOString() : null;
  await d.db.updateMpAccount(acc.user_id, { access_token: token.access_token, refresh_token: token.refresh_token ?? acc.refresh_token, expires_at });
  return token.access_token;
}

/** Trae los pagos aprobados de los últimos 30 días y los suma a la bandeja (sin duplicar). */
export async function syncAccount(d: Deps, acc: MpAccount): Promise<number> {
  const token = await freshToken(d, acc);
  const res = (await d.mp('/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=NOW-30DAYS&end_date=NOW&limit=100', {
    token,
  })) as { results?: MpPayment[] };
  const rows = (res.results ?? []).map((p) => paymentToInbox(p, acc.mp_user_id, acc.user_id)).filter((r): r is InboxRow => r !== null);
  const added = rows.length ? await d.db.insertInbox(rows) : 0;
  await d.db.updateMpAccount(acc.user_id, { last_synced_at: now(d).toISOString() });
  return added;
}

export async function syncUser(d: Deps, userId: string): Promise<number> {
  if (!(await d.db.isPro(userId))) throw new HttpError(402, 'La conexión con Mercado Pago viene con Parejo Plus');
  const acc = await d.db.getMpAccount(userId);
  if (!acc) throw new HttpError(404, 'No tenés Mercado Pago conectado');
  return syncAccount(d, acc);
}

/** Para el cron diario: sincroniza todas las cuentas conectadas de quienes tienen Plus. */
export async function syncAll(d: Deps): Promise<{ accounts: number; added: number; errors: number }> {
  let added = 0;
  let errors = 0;
  let accounts = 0;
  for (const acc of await d.db.listMpAccounts(500)) {
    if (!(await d.db.isPro(acc.user_id))) continue;
    accounts++;
    try {
      added += await syncAccount(d, acc);
    } catch {
      errors++;
    }
  }
  return { accounts, added, errors };
}
