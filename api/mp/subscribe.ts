import { createSubscription } from '../_lib/core';
import { deps, json, requireUser, route } from '../_lib/server';

/** POST /api/mp/subscribe { period: 'month' | 'year' } → { url } del checkout de Mercado Pago. */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as { period?: unknown };
  return json({ url: await createSubscription(deps(), user, body.period) });
});
