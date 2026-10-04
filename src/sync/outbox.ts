import type { Group } from '@/domain/types';

import { opKey, type Outbox, type Table } from './types';

export type Change = [table: Table, id: string, deleted?: boolean];

/** Anota cambios locales para subir. Solo aplica a grupos que están en la nube. */
export function track(outbox: Outbox, group: Group | undefined, changes: Change[]): Outbox {
  if (!group?.remote || changes.length === 0) return outbox;
  const next = { ...outbox };
  for (const [table, id, deleted] of changes) next[opKey(table, id)] = { groupId: group.id, table, id, deleted };
  return next;
}
