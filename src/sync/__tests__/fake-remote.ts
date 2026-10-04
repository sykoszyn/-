import type { Group, Member } from '@/domain/types';

import { groupToRow, memberToRow } from '../mappers';
import { emptySnapshot, SOFT_DELETE, TABLES, type InvitePreview, type Remote, type Row, type Snapshot, type Table } from '../types';

/** Un "Supabase" en memoria con las mismas reglas que las funciones SQL (membresía, invitaciones). */
export class FakeServer {
  tables = new Map<Table, Map<string, Row>>(TABLES.map((t) => [t, new Map()]));
  invites = new Map<string, { groupId: string; memberId: string | null; createdBy: string; used: boolean }>();
  private clock = Date.UTC(2026, 9, 4, 12, 0, 0);

  now() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  write(table: Table, row: Row) {
    const prev = this.tables.get(table)!.get(row.id);
    this.tables.get(table)!.set(row.id, { ...prev, ...row, created_at: prev?.created_at ?? this.now(), updated_at: this.now() });
  }

  isMember(groupId: string, userId: string) {
    return [...this.tables.get('members')!.values()].some((m) => m.group_id === groupId && m.user_id === userId);
  }

  groupOf(table: Table, row: Row): string {
    return table === 'groups' ? row.id : String(row.group_id);
  }

  as(userId: string): Remote {
    return new FakeRemote(this, userId);
  }
}

class FakeRemote implements Remote {
  constructor(
    private server: FakeServer,
    private uid: string,
  ) {}

  private assertMember(groupId: string) {
    if (!this.server.isMember(groupId, this.uid)) throw new Error('RLS: no sos parte del grupo');
  }

  async userId() {
    return this.uid;
  }

  async createGroup(group: Group, me: Member) {
    if (this.server.tables.get('groups')!.has(group.id)) {
      if (this.server.isMember(group.id, this.uid)) return;
      throw new Error('Ese grupo ya existe');
    }
    this.server.write('groups', groupToRow(group));
    this.server.write('members', { ...memberToRow(me, group.id), user_id: this.uid });
  }

  async upsert(table: Table, rows: Row[]) {
    for (const row of rows) {
      this.assertMember(this.server.groupOf(table, row));
      const prev = this.server.tables.get(table)!.get(row.id);
      if ('user_id' in row) throw new Error('user_id no se puede mandar');
      this.server.write(table, { ...row, user_id: prev?.user_id ?? null });
    }
  }

  async softDelete(table: Table, ids: string[]) {
    if (!SOFT_DELETE.includes(table)) throw new Error(`${table} no tiene borrado lógico`);
    for (const id of ids) {
      const prev = this.server.tables.get(table)!.get(id);
      if (!prev) continue;
      this.assertMember(this.server.groupOf(table, prev));
      this.server.write(table, { ...prev, deleted_at: this.server.now() });
    }
  }

  async pull(groupId: string, since: string | null): Promise<Snapshot> {
    this.assertMember(groupId);
    const snap = emptySnapshot();
    for (const table of TABLES) {
      for (const row of this.server.tables.get(table)!.values()) {
        if (this.server.groupOf(table, row) !== groupId) continue;
        if (since && String(row.updated_at) <= since) continue;
        snap[table].push({ ...row });
      }
    }
    return snap;
  }

  async myGroupIds() {
    return [...this.server.tables.get('members')!.values()].filter((m) => m.user_id === this.uid).map((m) => String(m.group_id));
  }

  async createInvite(groupId: string, memberId: string | null) {
    this.assertMember(groupId);
    const code = `code${this.server.invites.size + 1}`;
    this.server.invites.set(code, { groupId, memberId, createdBy: this.uid, used: false });
    return code;
  }

  async previewInvite(code: string): Promise<InvitePreview | null> {
    const inv = this.server.invites.get(code);
    if (!inv) return null;
    const group = this.server.tables.get('groups')!.get(inv.groupId)!;
    const member = inv.memberId ? this.server.tables.get('members')!.get(inv.memberId) : undefined;
    return { groupName: String(group.name), memberName: member ? String(member.name) : null, inviterName: null, status: inv.used ? 'used' : 'ok' };
  }

  async acceptInvite(code: string, name?: string) {
    const inv = this.server.invites.get(code);
    if (!inv) throw new Error('La invitación no existe');
    if (this.server.isMember(inv.groupId, this.uid)) return inv.groupId;
    if (inv.used) throw new Error('Esta invitación ya se usó');
    const member = inv.memberId ? this.server.tables.get('members')!.get(inv.memberId) : undefined;
    if (member && !member.user_id) this.server.write('members', { ...member, user_id: this.uid });
    else this.server.write('members', { id: `m-${this.uid}`, group_id: inv.groupId, user_id: this.uid, name: name ?? 'Nuevo', emoji: '🐸', color: '#2FB67C' });
    inv.used = true;
    return inv.groupId;
  }

  async leaveGroup(groupId: string) {
    for (const m of this.server.tables.get('members')!.values()) {
      if (m.group_id === groupId && m.user_id === this.uid) this.server.write('members', { ...m, user_id: null });
    }
  }
}
