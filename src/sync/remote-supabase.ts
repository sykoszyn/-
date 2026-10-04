import type { SupabaseClient } from '@supabase/supabase-js';

import type { Group, Member } from '@/domain/types';

import { memberToRow } from './mappers';
import { emptySnapshot, TABLES, type InvitePreview, type Remote, type Row, type Snapshot, type Table } from './types';

/** `Remote` sobre Supabase (PostgREST + funciones SQL de supabase/migrations). */
const PAGE = 1000;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export class SupabaseRemote implements Remote {
  constructor(private db: SupabaseClient) {}

  async userId() {
    const { data } = await this.db.auth.getSession();
    return data.session?.user.id ?? null;
  }

  async createGroup(group: Group, me: Member) {
    check(
      await this.db.rpc('create_group', {
        p_id: group.id,
        p_name: group.name,
        p_kind: group.kind,
        p_currency: group.currency,
        p_usd_rate: group.usdRate,
        p_member: memberToRow(me, group.id),
      }),
    );
  }

  async upsert(table: Table, rows: Row[]) {
    for (let i = 0; i < rows.length; i += PAGE) {
      check(await this.db.from(table).upsert(rows.slice(i, i + PAGE), { onConflict: 'id' }));
    }
  }

  async softDelete(table: Table, ids: string[]) {
    check(await this.db.from(table).update({ deleted_at: new Date().toISOString() }).in('id', ids));
  }

  async pull(groupId: string, since: string | null): Promise<Snapshot> {
    const snap = emptySnapshot();
    await Promise.all(
      TABLES.map(async (table) => {
        for (let from = 0; ; from += PAGE) {
          let q = this.db
            .from(table)
            .select('*')
            .eq(table === 'groups' ? 'id' : 'group_id', groupId);
          if (since) q = q.gt('updated_at', since);
          const rows = check(await q.order('updated_at').order('id').range(from, from + PAGE - 1)) as Row[];
          snap[table].push(...rows);
          if (rows.length < PAGE) break;
        }
      }),
    );
    return snap;
  }

  async myGroupIds() {
    const uid = await this.userId();
    if (!uid) return [];
    const rows = check(await this.db.from('members').select('group_id').eq('user_id', uid)) as { group_id: string }[];
    return [...new Set(rows.map((r) => r.group_id))];
  }

  async createInvite(groupId: string, memberId: string | null) {
    const row = check(await this.db.from('invites').insert({ group_id: groupId, member_id: memberId }).select('code').single()) as {
      code: string;
    };
    return row.code;
  }

  async previewInvite(code: string): Promise<InvitePreview | null> {
    const rows = check(await this.db.rpc('invite_preview', { p_code: code })) as
      | { group_name: string; member_name: string | null; inviter_name: string | null; status: InvitePreview['status'] }[]
      | null;
    const r = rows?.[0];
    return r ? { groupName: r.group_name, memberName: r.member_name, inviterName: r.inviter_name, status: r.status } : null;
  }

  async acceptInvite(code: string, name?: string) {
    return check(await this.db.rpc('accept_invite', { p_code: code, p_name: name ?? null })) as string;
  }

  async leaveGroup(groupId: string) {
    check(await this.db.rpc('leave_group', { p_group: groupId }));
  }
}

