import { createSubscription } from '../_lib/core';
import { deps, json, requireUser, route } from '../_lib/server';

/** POST /api/mp/subscribe → { url } del checkout de Mercado Pago para la suscripción anual. */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  return json({ url: await createSubscription(deps(), user) });
});
