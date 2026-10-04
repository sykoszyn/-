import type { Group, Member } from '@/domain/types';

/** Tablas sincronizadas, en el orden en que hay que subirlas (por las claves foráneas). */
export const TABLES = ['groups', 'members', 'bills', 'goals', 'expenses', 'settlements', 'goal_contributions'] as const;
export type Table = (typeof TABLES)[number];

/** Tablas donde borrar es "marcar como borrado" (deleted_at), para que el borrado viaje a los otros dispositivos. */
export const SOFT_DELETE: readonly Table[] = ['bills', 'goals', 'expenses', 'settlements'];

export type Row = { id: string; updated_at?: string; deleted_at?: string | null; [key: string]: unknown };

export type Snapshot = Record<Table, Row[]>;

/** Un cambio local pendiente de subir. Se guarda el id; el contenido se lee del estado al momento de subir. */
export type PendingOp = { groupId: string; table: Table; id: string; deleted?: boolean };

/** Clave `tabla:id` → cambio pendiente. Varias ediciones de la misma fila se pisan entre sí. */
export type Outbox = Record<string, PendingOp>;

export const opKey = (table: Table, id: string) => `${table}:${id}`;

export type InvitePreview = { groupName: string; memberName: string | null; inviterName: string | null; status: 'ok' | 'used' | 'expired' };

/** Lo que la sincronización necesita del servidor. La implementación real usa Supabase; los tests, una en memoria. */
export interface Remote {
  userId(): Promise<string | null>;
  createGroup(group: Group, me: Member): Promise<void>;
  upsert(table: Table, rows: Row[]): Promise<void>;
  softDelete(table: Table, ids: string[]): Promise<void>;
  /** Filas del grupo modificadas después de `since` (todas si es null), incluidas las borradas. */
  pull(groupId: string, since: string | null): Promise<Snapshot>;
  myGroupIds(): Promise<string[]>;
  createInvite(groupId: string, memberId: string | null): Promise<string>;
  previewInvite(code: string): Promise<InvitePreview | null>;
  acceptInvite(code: string, name?: string): Promise<string>;
  leaveGroup(groupId: string): Promise<void>;
}

export function emptySnapshot(): Snapshot {
  return { groups: [], members: [], bills: [], goals: [], expenses: [], settlements: [], goal_contributions: [] };
}
