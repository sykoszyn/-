import { HttpError, syncAll, syncUser } from '../_lib/core';
import { deps, json, requireUser, route } from '../_lib/server';

/** POST /api/mp/sync — trae ya los pagos de quien lo pide. */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  return json({ added: await syncUser(deps(), user.id) });
});

/** GET /api/mp/sync — lo llama el cron de Vercel una vez por día para todas las cuentas. */
export const GET = route(async (request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'No autorizado');
  return json(await syncAll(deps()));
});
