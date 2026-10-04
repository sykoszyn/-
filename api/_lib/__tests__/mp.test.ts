import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { POST as webhookRoute } from '../../mp/webhook';
import { connectUrl, createSubscription, finishConnect, handleSubscriptionWebhook, HttpError, syncAll, syncUser, type Db, type Deps, type MpAccount } from '../core';
import { paymentToInbox, proUntilFor, signState, verifyState, verifyWebhookSignature, type InboxRow, type MpPayment } from '../mp';

const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-04T12:00:00Z');

function fakeDb(pro: string[] = [ANA]) {
  const profiles = new Map<string, { pro_until: string; pre: string }>();
  const accounts = new Map<string, MpAccount>();
  const inbox: InboxRow[] = [];
  const db: Db = {
    isPro: async (u) => pro.includes(u),
    getProUntil: async (u) => profiles.get(u)?.pro_until ?? null,
    setPro: async (u, until, pre) => void profiles.set(u, { pro_until: until, pre }),
    saveMpAccount: async (a) => void accounts.set(a.user_id, { ...a, last_synced_at: null }),
    getMpAccount: async (u) => accounts.get(u) ?? null,
    listMpAccounts: async () => [...accounts.values()],
    updateMpAccount: async (u, patch) => void accounts.set(u, { ...accounts.get(u)!, ...patch }),
    insertInbox: async (rows) => {
      const fresh = rows.filter((r) => !inbox.some((x) => x.user_id === r.user_id && x.mp_payment_id === r.mp_payment_id));
      inbox.push(...fresh);
      return fresh.length;
    },
  };
  return { db, profiles, accounts, inbox };
}

type Call = { path: string; method?: string; token: string; body?: unknown };

function fakeMp(responses: Record<string, unknown>) {
  const calls: Call[] = [];
  const mp = async (path: string, init?: { method?: string; token: string; body?: unknown }) => {
    calls.push({ path, ...init! });
    const key = Object.keys(responses).find((k) => path.startsWith(k));
    if (!key) throw new Error(`sin respuesta para ${path}`);
    return responses[key];
  };
  return { mp, calls };
}

function deps(db: Db, mp: Deps['mp']): Deps {
  return {
    db,
    mp,
    now: () => NOW,
    env: { appUrl: 'https://parejo.app', mpAccessToken: 'APP_TOKEN', mpClientId: 'CID', mpClientSecret: 'CSECRET', stateSecret: 's3cr3t', priceArs: 42000 },
  };
}

const payment = (patch: Partial<MpPayment>): MpPayment => ({
  id: 1,
  status: 'approved',
  transaction_amount: 15000.5,
  currency_id: 'ARS',
  description: 'Coto',
  date_created: '2026-10-03T18:20:00.000-03:00',
  date_approved: '2026-10-03T18:21:00.000-03:00',
  collector_id: 999,
  payer: { id: 123 },
  ...patch,
});

describe('mercado pago: piezas puras', () => {
  it('keeps Pro until the next charge plus grace, and respects what was paid', () => {
    expect(proUntilFor({ id: 'p', status: 'authorized', next_payment_date: '2027-10-04T00:00:00.000-03:00' }, NOW, null)).toBe('2027-10-07T03:00:00.000Z');
    expect(proUntilFor({ id: 'p', status: 'authorized' }, NOW, null)).toBe('2027-10-04T12:00:00.000Z');
    expect(proUntilFor({ id: 'p', status: 'cancelled' }, NOW, '2027-01-01T00:00:00.000Z')).toBeNull();
    expect(proUntilFor({ id: 'p', status: 'authorized', next_payment_date: '2026-11-01T00:00:00Z' }, NOW, '2027-12-31T00:00:00.000Z')).toBe('2027-12-31T00:00:00.000Z');
  });

  it('checks the webhook signature', () => {
    const ts = '1704908010';
    const v1 = createHmac('sha256', 'whsec').update(`id:abc123;request-id:req-1;ts:${ts};`).digest('hex');
    expect(verifyWebhookSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: 'ABC123', secret: 'whsec' })).toBe(true);
    expect(verifyWebhookSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-2', dataId: 'abc123', secret: 'whsec' })).toBe(false);
    expect(verifyWebhookSignature({ signature: null, requestId: 'req-1', dataId: 'abc123', secret: 'whsec' })).toBe(false);
  });

  it('signs the OAuth state so nobody can connect someone else’s account', () => {
    const state = signState(ANA, 'k', NOW.getTime());
    expect(verifyState(state, 'k', NOW.getTime())).toBe(ANA);
    expect(verifyState(state, 'k', NOW.getTime() + 16 * 60_000)).toBeNull();
    expect(verifyState(state.replace(ANA, BETO), 'k', NOW.getTime())).toBeNull();
    expect(verifyState(state, 'otra', NOW.getTime())).toBeNull();
  });

  it('turns approved payments into inbox rows', () => {
    expect(paymentToInbox(payment({ collector_id: 555 }), 999, ANA)).toEqual({
      user_id: ANA,
      mp_payment_id: 1,
      direction: 'out',
      amount: 1_500_050,
      currency: 'ARS',
      description: 'Coto',
      counterpart: null,
      date: '2026-10-03',
    });
    expect(paymentToInbox(payment({ description: '', payer: { first_name: 'Beto', last_name: 'Pérez' } }), 999, ANA)).toMatchObject({
      direction: 'in',
      description: 'Transferencia recibida',
      counterpart: 'Beto Pérez',
    });
    expect(paymentToInbox(payment({ status: 'rejected' }), 999, ANA)).toBeNull();
    expect(paymentToInbox(payment({ currency_id: 'BRL' }), 999, ANA)).toBeNull();
  });
});

describe('mercado pago: flujos', () => {
  it('creates the yearly subscription with the server price', async () => {
    const { db } = fakeDb();
    const { mp, calls } = fakeMp({ '/preapproval': { id: 'pre1', init_point: 'https://mp/checkout' } });
    expect(await createSubscription(deps(db, mp), { id: ANA, email: 'ana@x.com' })).toBe('https://mp/checkout');
    expect(calls[0]).toMatchObject({
      path: '/preapproval',
      method: 'POST',
      token: 'APP_TOKEN',
      body: { external_reference: ANA, payer_email: 'ana@x.com', auto_recurring: { frequency: 12, frequency_type: 'months', transaction_amount: 42000, currency_id: 'ARS' } },
    });
  });

  it('activates Pro only after asking Mercado Pago itself', async () => {
    const { db, profiles } = fakeDb();
    const { mp } = fakeMp({
      '/authorized_payments/ap1': { preapproval_id: 'pre1' },
      '/preapproval/pre1': { id: 'pre1', status: 'authorized', external_reference: BETO, next_payment_date: '2027-10-04T00:00:00Z' },
      '/preapproval/fake': { id: 'fake', status: 'authorized', external_reference: 'no-es-un-usuario' },
      '/preapproval/pending': { id: 'pending', status: 'pending', external_reference: BETO },
    });
    const d = deps(db, mp);
    expect(await handleSubscriptionWebhook(d, 'subscription_authorized_payment', 'ap1')).toBe('updated');
    expect(profiles.get(BETO)).toEqual({ pro_until: '2027-10-07T00:00:00.000Z', pre: 'pre1' });
    expect(await handleSubscriptionWebhook(d, 'subscription_preapproval', 'fake')).toBe('ignored');
    expect(await handleSubscriptionWebhook(d, 'subscription_preapproval', 'pending')).toBe('ignored');
    expect(await handleSubscriptionWebhook(d, 'payment', 'x')).toBe('ignored');
  });

  it('only Pro users can connect, and the callback stores the account and brings payments', async () => {
    const { db, accounts, inbox } = fakeDb([ANA]);
    const { mp, calls } = fakeMp({
      '/oauth/token': { access_token: 'USER_TOKEN', refresh_token: 'R', user_id: 999, expires_in: 15552000 },
      '/v1/payments/search': { results: [payment({ id: 1, collector_id: 555 }), payment({ id: 2 }), payment({ id: 3, status: 'pending' })] },
    });
    const d = deps(db, mp);
    await expect(connectUrl(d, BETO)).rejects.toThrow(HttpError);
    const url = new URL(await connectUrl(d, ANA));
    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.ar/authorization');
    expect(url.searchParams.get('redirect_uri')).toBe('https://parejo.app/api/mp/callback');

    expect(await finishConnect(d, 'CODE', 'forged.state.sig')).toBe('https://parejo.app/settings?mp=error');
    expect(await finishConnect(d, 'CODE', url.searchParams.get('state'))).toBe('https://parejo.app/settings?mp=ok');
    expect(accounts.get(ANA)).toMatchObject({ mp_user_id: 999, access_token: 'USER_TOKEN', refresh_token: 'R' });
    expect(inbox.map((r) => [r.mp_payment_id, r.direction])).toEqual([
      [1, 'out'],
      [2, 'in'],
    ]);
    expect(calls.find((c) => c.path.startsWith('/v1/payments'))?.token).toBe('USER_TOKEN');

    // Volver a sincronizar no duplica.
    expect(await syncUser(d, ANA)).toBe(0);
  });

  it('refreshes tokens that are about to expire and skips users without Pro in the cron', async () => {
    const { db, accounts } = fakeDb([ANA]);
    accounts.set(ANA, { user_id: ANA, mp_user_id: 999, access_token: 'OLD', refresh_token: 'R', expires_at: '2026-10-05T00:00:00Z', last_synced_at: null });
    accounts.set(BETO, { user_id: BETO, mp_user_id: 888, access_token: 'B', refresh_token: null, expires_at: null, last_synced_at: null });
    const { mp, calls } = fakeMp({
      '/oauth/token': { access_token: 'NEW', refresh_token: 'R2', user_id: 999, expires_in: 15552000 },
      '/v1/payments/search': { results: [payment({ id: 9, collector_id: 1 })] },
    });
    expect(await syncAll(deps(db, mp))).toEqual({ accounts: 1, added: 1, errors: 0 });
    expect(accounts.get(ANA)).toMatchObject({ access_token: 'NEW', refresh_token: 'R2', last_synced_at: NOW.toISOString() });
    expect(calls.filter((c) => c.path.startsWith('/v1/payments')).map((c) => c.token)).toEqual(['NEW']);
  });

  it('the webhook route rejects bad signatures before touching anything', async () => {
    process.env.MP_WEBHOOK_SECRET = 'whsec';
    const res = await webhookRoute(
      new Request('https://parejo.app/api/mp/webhook?data.id=pre1&type=subscription_preapproval', {
        method: 'POST',
        headers: { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'r' },
        body: JSON.stringify({ type: 'subscription_preapproval', data: { id: 'pre1' } }),
      }),
    );
    expect(res.status).toBe(401);
    delete process.env.MP_WEBHOOK_SECRET;
  });
});
