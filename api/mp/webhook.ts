import { handleSubscriptionWebhook } from '../_lib/core';
import { verifyWebhookSignature } from '../_lib/mp';
import { deps, json, route } from '../_lib/server';

/** POST /api/mp/webhook — avisos de Mercado Pago sobre suscripciones. */
export const POST = route(async (request) => {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { type?: string; topic?: string; data?: { id?: string | number } };
  const type = body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '';
  const dataId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '');
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (
    secret &&
    !verifyWebhookSignature({
      signature: request.headers.get('x-signature'),
      requestId: request.headers.get('x-request-id'),
      dataId: url.searchParams.get('data.id') ?? dataId,
      secret,
    })
  ) {
    return json({ error: 'firma inválida' }, 401);
  }
  if (!dataId) return json({ ok: true, result: 'ignored' });
  return json({ ok: true, result: await handleSubscriptionWebhook(deps(), type, dataId) });
});
