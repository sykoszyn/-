import { connectUrl } from '../_lib/core';
import { deps, json, requireUser, route } from '../_lib/server';

/** POST /api/mp/connect → { url } para autorizar a Parejo a leer los pagos de Mercado Pago. */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  return json({ url: await connectUrl(deps(), user.id) });
});
