import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useStore } from '@/store';

import * as engine from './engine';
import { inviteUrl, remote, supabase, syncEnabled } from './supabase';
import { TABLES } from './types';

export { syncEnabled };

type SyncStatus = {
  ready: boolean;
  userId: string | null;
  email: string | null;
  status: 'idle' | 'syncing' | 'error';
  error: string | null;
  lastSyncAt: number | null;
};

export const useSync = create<SyncStatus>(() => ({
  ready: !syncEnabled,
  userId: null,
  email: null,
  status: 'idle',
  error: null,
  lastSyncAt: null,
}));

function deps(): engine.SyncDeps {
  if (!remote) throw new Error('La sincronización no está configurada');
  return { remote, get: () => useStore.getState(), set: (fn) => useStore.setState(fn) };
}

const friendly = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/network|fetch|Failed to fetch/i.test(msg)) return 'Sin conexión. Se va a sincronizar cuando vuelva.';
  return msg;
};

let running: Promise<void> | null = null;
let again = false;

/** Sincroniza ya (sube pendientes y trae cambios). Si ya está corriendo, encola una vuelta más. */
export function syncNow(): Promise<void> {
  if (!remote || !useSync.getState().userId) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  useSync.setState({ status: 'syncing' });
  running = (async () => {
    try {
      do {
        again = false;
        await engine.syncAll(deps());
      } while (again);
      useSync.setState({ status: 'idle', error: null, lastSyncAt: Date.now() });
    } catch (e) {
      useSync.setState({ status: 'error', error: friendly(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;
function syncSoon(ms = 800) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncNow();
  }, ms);
}

// ── Acciones para las pantallas ─────────────────────────────────────────────

export async function sendLoginCode(email: string) {
  if (!supabase) throw new Error('La sincronización no está configurada');
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
  if (error) throw new Error(error.message);
}

export async function verifyLoginCode(email: string, token: string) {
  if (!supabase) throw new Error('La sincronización no está configurada');
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'El código no es válido o ya venció. Pedí uno nuevo.' : error.message);
  // No esperar al evento de sesión: así se puede sincronizar enseguida.
  useSync.setState({ ready: true, userId: data.user?.id ?? null, email: data.user?.email ?? null });
}

/** Cierra sesión. Los grupos compartidos se quitan del dispositivo (siguen en la nube). */
export async function signOut() {
  await supabase?.auth.signOut();
  useStore.setState((s) => {
    const groups = Object.fromEntries(Object.entries(s.groups).filter(([, g]) => !g.remote));
    const activeGroupId = s.activeGroupId && groups[s.activeGroupId] ? s.activeGroupId : (Object.keys(groups)[0] ?? null);
    return { groups, activeGroupId, outbox: {} };
  });
}

/** Sube el grupo a la nube (si hace falta), crea una invitación para ese miembro y devuelve el mensaje para compartir. */
export async function createInviteMessage(groupId: string, memberId: string | null): Promise<string> {
  const d = deps();
  // Al subir un grupo viejo los ids pueden cambiar; el orden de los miembros no.
  const index = memberId ? useStore.getState().groups[groupId].members.findIndex((m) => m.id === memberId) : -1;
  const id = await engine.uploadGroup(d, groupId);
  const group = useStore.getState().groups[id];
  const member = index >= 0 ? group.members[index] : null;
  const code = await d.remote.createInvite(id, member?.id ?? null);
  syncSoon(0);
  const who = member ? `${member.name}, ` : '';
  const everyone = group.members.length > 2 ? 'todos' : 'los dos';
  return `${who}sumate a "${group.name}" en Parejo 💜 Así vemos las mismas cuentas ${everyone}.\n\n${inviteUrl(code)}\n\nCódigo: ${code}`;
}

export async function uploadActiveGroup() {
  const id = useStore.getState().activeGroupId;
  if (!id) return;
  await engine.uploadGroup(deps(), id);
  await syncNow();
}

export async function previewInvite(code: string) {
  if (!remote) return null;
  return remote.previewInvite(code.trim());
}

export async function joinGroup(code: string, name?: string) {
  const id = await engine.joinWithInvite(deps(), code.trim(), name);
  useSync.setState({ lastSyncAt: Date.now(), status: 'idle', error: null });
  return id;
}

export async function leaveGroup(groupId: string) {
  await engine.leaveGroup(deps(), groupId);
}

// ── Componente que mantiene todo andando en segundo plano ───────────────────

/** Escucha la sesión, sube cambios al rato de hacerlos y escucha en tiempo real lo que carga la pareja. */
export function SyncManager() {
  const userId = useSync((s) => s.userId);
  const remoteIds = useStore((s) =>
    Object.values(s.groups)
      .filter((g) => g.remote)
      .map((g) => g.id)
      .sort()
      .join(','),
  );
  const groupIds = useMemo(() => (remoteIds ? remoteIds.split(',') : []), [remoteIds]);

  // Sesión.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      useSync.setState({ ready: true, userId: data.session?.user.id ?? null, email: data.session?.user.email ?? null });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      useSync.setState({ ready: true, userId: session?.user.id ?? null, email: session?.user.email ?? null });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Al iniciar sesión, al volver a la app y cada minuto.
  useEffect(() => {
    if (!userId) return;
    syncNow();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && syncNow());
    const interval = setInterval(syncNow, 60_000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [userId]);

  // Cambios locales → subir al rato.
  useEffect(() => {
    if (!userId) return;
    return useStore.subscribe((s, prev) => {
      if (s.outbox !== prev.outbox && Object.keys(s.outbox).length > 0) syncSoon();
    });
  }, [userId]);

  // Tiempo real: cuando la pareja carga algo, traerlo.
  useEffect(() => {
    if (!supabase || !userId || groupIds.length === 0) return;
    const client = supabase;
    const channels = groupIds.map((id) => {
      let channel = client.channel(`group:${id}`);
      for (const table of TABLES) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: table === 'groups' ? `id=eq.${id}` : `group_id=eq.${id}` },
          () => syncSoon(300),
        );
      }
      return channel.subscribe();
    });
    return () => {
      for (const c of channels) client.removeChannel(c);
    };
  }, [userId, groupIds]);

  return null;
}
