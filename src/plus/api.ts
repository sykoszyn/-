import { Platform } from 'react-native';

import { supabase } from '@/sync/supabase';

/** Base de las funciones del servidor (Vercel). En la web es el mismo dominio. */
export function apiBase(): string {
  if (Platform.OS === 'web') return '';
  return (process.env.EXPO_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
}

/** Llama a una función de `api/` con la sesión del usuario. */
export async function callApi<T>(path: string, body?: unknown): Promise<T> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error('Necesitás iniciar sesión');
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  return json;
}
