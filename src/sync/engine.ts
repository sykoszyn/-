import type { Group } from '@/domain/types';

import { groupRows, localRow } from './mappers';
import { applySnapshot, ensureUuids } from './merge';
import { SOFT_DELETE, TABLES, type Outbox, type PendingOp, type Remote, type Row, type Table } from './types';

/** La parte del estado de la app que toca la sincronización. */
export type SyncState = {
  groups: Record<string, Group>;
  activeGroupId: string | null;
  outbox: Outbox;
};

export type SyncDeps = {
  remote: Remote;
  get: () => SyncState;
  set: (fn: (s: SyncState) => Partial<SyncState>) => void;
};

/** Margen para no perder filas que se confirmaron con una hora de servidor apenas anterior. */
const OVERLAP_MS = 2 * 60 * 1000;

function since(lastPulledAt: string | null): string | null {
  if (!lastPulledAt) return null;
  const t = Date.parse(lastPulledAt);
  return Number.isNaN(t) ? null : new Date(t - OVERLAP_MS).toISOString();
}

/**
 * Sube un grupo que hasta ahora vivía solo en el teléfono y lo deja sincronizando.
 * Devuelve el id del grupo (puede cambiar si tenía ids viejos).
 */
export async function uploadGroup(deps: SyncDeps, groupId: string): Promise<string> {
  const local = deps.get().groups[groupId];
  if (!local) throw new Error('El grupo no existe');
  if (local.remote) return groupId;
  const group = ensureUuids(local);
  const me = group.members.find((m) => m.id === group.meId) ?? group.members[0];

  await deps.remote.createGroup(group, me);
  const rows = groupRows(group);
  rows.members = rows.members.filter((r) => r.id !== me.id);
  for (const table of TABLES) {
    if (table === 'groups' || rows[table].length === 0) continue;
    await deps.remote.upsert(table, rows[table]);
  }

  const userId = await deps.remote.userId();
  const uploaded: Group = {
    ...group,
    members: group.members.map((m) => (m.id === me.id ? { ...m, userId: userId ?? undefined } : m)),
    remote: { lastPulledAt: null },
  };
  deps.set((s) => {
    const groups = { ...s.groups };
    delete groups[groupId];
    groups[uploaded.id] = uploaded;
    const outbox = Object.fromEntries(Object.entries(s.outbox).filter(([, op]) => op.groupId !== groupId));
    return { groups, outbox, activeGroupId: s.activeGroupId === groupId ? uploaded.id : s.activeGroupId };
  });
  return uploaded.id;
}

/** Sube los cambios locales pendientes. Si algo falla, quedan en la cola para el próximo intento. */
export async function flush(deps: SyncDeps): Promise<number> {
  const ops = Object.entries(deps.get().outbox);
  if (ops.length === 0) return 0;

  const upserts = new Map<Table, { key: string; op: PendingOp; row: Row }[]>();
  const deletes = new Map<Table, { key: string; op: PendingOp }[]>();
  const done: [string, PendingOp][] = [];

  for (const [key, op] of ops) {
    const group = deps.get().groups[op.groupId];
    if (!group?.remote) {
      done.push([key, op]); // el grupo ya no está o no es remoto: no hay nada que subir
      continue;
    }
    const row = op.deleted ? null : localRow(group, op.table, op.id);
    if (row) upserts.set(op.table, [...(upserts.get(op.table) ?? []), { key, op, row }]);
    else if (SOFT_DELETE.includes(op.table)) deletes.set(op.table, [...(deletes.get(op.table) ?? []), { key, op }]);
    else done.push([key, op]);
  }

  for (const table of TABLES) {
    const items = upserts.get(table);
    if (!items) continue;
    await deps.remote.upsert(table, items.map((i) => i.row));
    done.push(...items.map((i) => [i.key, i.op] as [string, PendingOp]));
  }
  for (const table of [...TABLES].reverse()) {
    const items = deletes.get(table);
    if (!items) continue;
    await deps.remote.softDelete(table, items.map((i) => i.op.id));
    done.push(...items.map((i) => [i.key, i.op] as [string, PendingOp]));
  }

  // Solo se sacan de la cola si no se volvieron a editar mientras se subían.
  deps.set((s) => {
    const outbox = { ...s.outbox };
    for (const [key, op] of done) if (outbox[key] === op) delete outbox[key];
    return { outbox };
  });
  return done.length;
}

/** Trae lo que cambió en un grupo (o todo, si `full`) y lo mezcla con lo local. */
export async function pullGroup(deps: SyncDeps, groupId: string, full = false): Promise<void> {
  const before = deps.get().groups[groupId];
  const snapshot = await deps.remote.pull(groupId, full || !before?.remote ? null : since(before.remote.lastPulledAt));
  const userId = await deps.remote.userId();
  deps.set((s) => {
    const pending = new Set(Object.keys(s.outbox));
    const merged = applySnapshot(s.groups[groupId], snapshot, pending, userId);
    if (!merged) return {};
    return { groups: { ...s.groups, [groupId]: merged } };
  });
}

/** Ciclo completo: subir pendientes, traer cambios y descubrir grupos nuevos (otro dispositivo, invitaciones). */
export async function syncAll(deps: SyncDeps): Promise<void> {
  await flush(deps);
  const remoteIds = await deps.remote.myGroupIds();
  const local = deps.get().groups;
  for (const id of remoteIds) await pullGroup(deps, id, !local[id]);
  // Grupos remotos de los que ya no soy parte (salí desde otro dispositivo): se quitan de acá.
  const gone = Object.values(deps.get().groups).filter((g) => g.remote && !remoteIds.includes(g.id));
  if (gone.length) removeGroups(deps, gone.map((g) => g.id));
}

export async function joinWithInvite(deps: SyncDeps, code: string, name?: string): Promise<string> {
  const groupId = await deps.remote.acceptInvite(code, name);
  await pullGroup(deps, groupId, true);
  deps.set(() => ({ activeGroupId: groupId }));
  return groupId;
}

export async function leaveGroup(deps: SyncDeps, groupId: string): Promise<void> {
  await deps.remote.leaveGroup(groupId);
  removeGroups(deps, [groupId]);
}

function removeGroups(deps: SyncDeps, ids: string[]) {
  deps.set((s) => {
    const groups = { ...s.groups };
    for (const id of ids) delete groups[id];
    const outbox = Object.fromEntries(Object.entries(s.outbox).filter(([, op]) => !ids.includes(op.groupId)));
    const activeGroupId = s.activeGroupId && groups[s.activeGroupId] ? s.activeGroupId : (Object.keys(groups)[0] ?? null);
    return { groups, outbox, activeGroupId };
  });
}
