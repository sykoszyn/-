import { createHmac, timingSafeEqual } from 'node:crypto';

/** Lógica de Mercado Pago sin efectos: armado de pedidos, validaciones y conversión de pagos. */

export const MP_API = 'https://api.mercadopago.com';
export const MP_AUTH = 'https://auth.mercadopago.com.ar/authorization';

export type MpFetch = (path: string, init?: { method?: string; token: string; body?: unknown }) => Promise<unknown>;

/** Cliente HTTP mínimo para la API de Mercado Pago. */
export const mpFetch: MpFetch = async (path, init) => {
  const res = await fetch(`${MP_API}${path}`, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${init?.token}`, 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${(json as { message?: string }).message ?? 'error'}`);
  return json;
};

// ── Suscripción a Parejo Plus ──────────────────────────────────────────────

export type Period = 'month' | 'year';

export function preapprovalBody(opts: { userId: string; email: string; period: Period; priceArs: number; appUrl: string }) {
  return {
    reason: opts.period === 'year' ? 'Parejo Plus · anual' : 'Parejo Plus · mensual',
    external_reference: opts.userId,
    payer_email: opts.email,
    auto_recurring: { frequency: opts.period === 'year' ? 12 : 1, frequency_type: 'months', transaction_amount: opts.priceArs, currency_id: 'ARS' },
    back_url: `${opts.appUrl.replace(/\/$/, '')}/plus?status=ok`,
    status: 'pending',
  };
}

export type Preapproval = {
  id: string;
  status: string;
  external_reference?: string;
  next_payment_date?: string | null;
  auto_recurring?: { frequency?: number; frequency_type?: string } | null;
};

/**
 * Hasta cuándo queda Plus según la suscripción. Si está activa, hasta el próximo cobro (+3 días de gracia);
 * si se pausó o canceló, se respeta lo que ya pagó (devuelve null = no cambiar).
 */
export function proUntilFor(pre: Preapproval, now: Date, current: string | null): string | null {
  if (pre.status !== 'authorized') return null;
  const next = pre.next_payment_date ? Date.parse(pre.next_payment_date) : NaN;
  const months = pre.auto_recurring?.frequency_type === 'months' ? (pre.auto_recurring.frequency ?? 1) : 1;
  const until = Number.isNaN(next) ? now.getTime() + Math.round(months * 30.5) * 86_400_000 : next + 3 * 86_400_000;
  const candidate = new Date(until).toISOString();
  return current && current > candidate ? current : candidate;
}

/** Firma de los webhooks: x-signature "ts=...,v1=..." sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". */
export function verifyWebhookSignature(opts: { signature: string | null; requestId: string | null; dataId: string | null; secret: string }): boolean {
  if (!opts.signature) return false;
  const parts = Object.fromEntries(opts.signature.split(',').map((p) => p.trim().split('=') as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  let manifest = '';
  if (opts.dataId) manifest += `id:${opts.dataId.toLowerCase()};`;
  if (opts.requestId) manifest += `request-id:${opts.requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = createHmac('sha256', opts.secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Conectar la cuenta (OAuth) ─────────────────────────────────────────────

/** El `state` del OAuth lleva el usuario y vence a los 15 minutos, firmado para que nadie lo falsifique. */
export function signState(userId: string, secret: string, now = Date.now()): string {
  const exp = String(now + 15 * 60_000);
  const sig = createHmac('sha256', secret).update(`${userId}.${exp}`).digest('base64url');
  return `${userId}.${exp}.${sig}`;
}

export function verifyState(state: string, secret: string, now = Date.now()): string | null {
  const [userId, exp, sig] = state.split('.');
  if (!userId || !exp || !sig || Number(exp) < now) return null;
  const expected = createHmac('sha256', secret).update(`${userId}.${exp}`).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}

export function authorizeUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({ client_id: opts.clientId, response_type: 'code', platform_id: 'mp', state: opts.state, redirect_uri: opts.redirectUri });
  return `${MP_AUTH}?${q.toString()}`;
}

export type OAuthToken = { access_token: string; refresh_token?: string; user_id: number; expires_in?: number };

// ── Pagos → bandeja ────────────────────────────────────────────────────────

export type MpPayment = {
  id: number;
  status: string;
  transaction_amount: number;
  currency_id: string;
  description?: string | null;
  statement_descriptor?: string | null;
  date_created: string;
  date_approved?: string | null;
  collector_id?: number | null;
  payer?: { id?: number | string | null; email?: string | null; first_name?: string | null; last_name?: string | null } | null;
  operation_type?: string | null;
};

export type InboxRow = {
  user_id: string;
  mp_payment_id: number;
  direction: 'in' | 'out';
  amount: number;
  currency: 'ARS' | 'USD';
  description: string;
  counterpart: string | null;
  date: string;
};

/** Convierte un pago aprobado de Mercado Pago en una fila de la bandeja (o null si no aplica). */
export function paymentToInbox(p: MpPayment, mpUserId: number, userId: string): InboxRow | null {
  if (p.status !== 'approved') return null;
  if (p.currency_id !== 'ARS' && p.currency_id !== 'USD') return null;
  if (!(p.transaction_amount > 0)) return null;
  const direction = Number(p.collector_id) === Number(mpUserId) ? 'in' : 'out';
  const payerName = [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' ').trim();
  const description =
    (p.description ?? '').trim() ||
    (p.statement_descriptor ?? '').trim() ||
    (direction === 'in' ? 'Transferencia recibida' : 'Pago con Mercado Pago');
  return {
    user_id: userId,
    mp_payment_id: p.id,
    direction,
    amount: Math.round(p.transaction_amount * 100),
    currency: p.currency_id,
    description: description.slice(0, 120),
    counterpart: direction === 'in' ? payerName || p.payer?.email || null : null,
    date: (p.date_approved ?? p.date_created).slice(0, 10),
  };
}
