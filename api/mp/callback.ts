import { finishConnect } from '../_lib/core';
import { deps, route } from '../_lib/server';

/** GET /api/mp/callback — Mercado Pago vuelve acá después de autorizar. */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const to = await finishConnect(deps(), url.searchParams.get('code'), url.searchParams.get('state'));
  return Response.redirect(to, 302);
});
