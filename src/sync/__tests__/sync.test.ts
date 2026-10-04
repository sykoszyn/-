import { describe, expect, it } from 'vitest';

import { currentMonth } from '@/domain/dates';
import { demoGroup } from '@/domain/demo';
import { isUuid, newId } from '@/domain/id';
import { balances } from '@/domain/ledger';

import { flush, joinWithInvite, leaveGroup, pullGroup, syncAll, uploadGroup } from '../engine';
import { ensureUuids } from '../merge';
import { FakeServer } from './fake-remote';
import { device, expense, legacyGroup } from './helpers';

describe('ensureUuids', () => {
  it('turns every id into a UUID and keeps the references consistent', () => {
    const old = legacyGroup();
    const g = ensureUuids(old);
    const [juli, sofi] = g.members;
    expect([g.id, juli.id, sofi.id, g.expenses[0].id, g.bills[0].id, g.goals[0].contributions[0].id].every(isUuid)).toBe(true);
    expect(g.meId).toBe(juli.id);
    expect(g.expenses[0]).toMatchObject({ paidBy: juli.id, split: { mode: 'full', memberId: sofi.id }, billId: g.bills[0].id });
    expect(g.expenses[1].split).toEqual({ mode: 'custom', weights: { [juli.id]: 70, [sofi.id]: 30 } });
    expect(g.settlements[0]).toMatchObject({ from: sofi.id, to: juli.id });
    expect(g.goals[0].contributions[0].memberId).toBe(sofi.id);
    expect(balances(g, currentMonth())[juli.id]).toBe(balances(old, currentMonth()).juli);
  });

  it('leaves UUID groups untouched', () => {
    const g = demoGroup();
    expect(ensureUuids(g)).toEqual(g);
  });
});

describe('sync between two phones', () => {
  async function coupleOnline() {
    const server = new FakeServer();
    const juli = device(server.as('uid-juli'));
    const sofi = device(server.as('uid-sofi'));
    juli.add(legacyGroup());
    const groupId = await uploadGroup(juli.deps, juli.state.activeGroupId!);
    const sofiMember = juli.group.members.find((m) => m.name === 'Sofi')!;
    const code = await juli.deps.remote.createInvite(groupId, sofiMember.id);
    await joinWithInvite(sofi.deps, code);
    return { server, juli, sofi, groupId };
  }

  it('uploads a local group and the invited partner sees the same accounts', async () => {
    const { juli, sofi, groupId } = await coupleOnline();
    expect(isUuid(groupId)).toBe(true);
    expect(juli.state.activeGroupId).toBe(groupId);
    expect(juli.group.remote).toBeDefined();

    // Sofi quedó vinculada a "su" miembro y se ve a sí misma como "yo".
    const sofiMember = sofi.group.members.find((m) => m.name === 'Sofi')!;
    expect(sofi.group.meId).toBe(sofiMember.id);
    expect(sofiMember.userId).toBe('uid-sofi');
    expect(juli.group.meId).not.toBe(sofi.group.meId);

    // Mismos números en los dos teléfonos.
    expect(balances(sofi.group, currentMonth())).toEqual(balances(juli.group, currentMonth()));
    expect(sofi.group.expenses).toHaveLength(2);
    expect(sofi.group.goals[0].contributions).toHaveLength(1);
  });

  it('changes travel both ways, including edits and deletes', async () => {
    const { juli, sofi } = await coupleOnline();

    // Juli carga una compra en cuotas; Sofi la ve después de sincronizar.
    const heladera = expense(juli.group, { description: 'Heladera', amount: 600_000_00, installments: 6 });
    juli.mutate((g) => ({ ...g, expenses: [...g.expenses, heladera] }), [['expenses', heladera.id]]);
    expect(Object.keys(juli.state.outbox)).toHaveLength(1);
    await syncAll(juli.deps);
    expect(juli.state.outbox).toEqual({});
    await syncAll(sofi.deps);
    expect(sofi.group.expenses.find((e) => e.id === heladera.id)).toMatchObject({ description: 'Heladera', installments: 6 });

    // Sofi la corrige y borra otro gasto; Juli recibe las dos cosas.
    const borrar = sofi.group.expenses.find((e) => e.id !== heladera.id)!;
    sofi.mutate(
      (g) => ({
        ...g,
        expenses: g.expenses.filter((e) => e.id !== borrar.id).map((e) => (e.id === heladera.id ? { ...e, description: 'Heladera Samsung' } : e)),
      }),
      [
        ['expenses', heladera.id],
        ['expenses', borrar.id, true],
      ],
    );
    await syncAll(sofi.deps);
    await syncAll(juli.deps);
    expect(juli.group.expenses.find((e) => e.id === heladera.id)?.description).toBe('Heladera Samsung');
    expect(juli.group.expenses.some((e) => e.id === borrar.id)).toBe(false);
    expect(balances(juli.group, currentMonth())).toEqual(balances(sofi.group, currentMonth()));

    // Un aporte a la meta y un pago para saldar también viajan.
    const goal = juli.group.goals[0];
    const contribution = { id: newId(), memberId: juli.group.meId, amount: 5_000, date: '2026-10-04' };
    juli.mutate((g) => ({ ...g, goals: g.goals.map((x) => (x.id === goal.id ? { ...x, contributions: [...x.contributions, contribution] } : x)) }), [
      ['goal_contributions', contribution.id],
    ]);
    await syncAll(juli.deps);
    await syncAll(sofi.deps);
    expect(sofi.group.goals[0].contributions.map((c) => c.id)).toContain(contribution.id);
  });

  it('does not overwrite local changes that are still waiting to be uploaded', async () => {
    const { juli, sofi } = await coupleOnline();
    const target = juli.group.expenses[0];

    // Sofi edita y sube.
    sofi.mutate((g) => ({ ...g, expenses: g.expenses.map((e) => (e.id === target.id ? { ...e, description: 'De Sofi' } : e)) }), [['expenses', target.id]]);
    await flush(sofi.deps);

    // Juli edita sin conexión y después trae cambios: su edición no se pierde...
    juli.mutate((g) => ({ ...g, expenses: g.expenses.map((e) => (e.id === target.id ? { ...e, description: 'De Juli' } : e)) }), [['expenses', target.id]]);
    await pullGroup(juli.deps, juli.group.id);
    expect(juli.group.expenses.find((e) => e.id === target.id)?.description).toBe('De Juli');

    // ...y al sincronizar, gana la última en subir (la de Juli) en los dos teléfonos.
    await syncAll(juli.deps);
    await syncAll(sofi.deps);
    expect(sofi.group.expenses.find((e) => e.id === target.id)?.description).toBe('De Juli');
  });

  it('keeps an edit made while the upload was in flight', async () => {
    const { juli } = await coupleOnline();
    const e = expense(juli.group, {});
    juli.mutate((g) => ({ ...g, expenses: [...g.expenses, e] }), [['expenses', e.id]]);
    const original = juli.deps.remote.upsert.bind(juli.deps.remote);
    juli.deps.remote.upsert = async (table, rows) => {
      await original(table, rows);
      // Mientras subía, la persona volvió a editar el mismo gasto.
      juli.mutate((g) => ({ ...g, expenses: g.expenses.map((x) => (x.id === e.id ? { ...x, amount: 1 } : x)) }), [['expenses', e.id]]);
    };
    await flush(juli.deps);
    expect(Object.keys(juli.state.outbox)).toEqual([`expenses:${e.id}`]);
  });

  it('a second phone of the same person discovers the group on sign in', async () => {
    const { server, juli, groupId } = await coupleOnline();
    const juliTablet = device(server.as('uid-juli'));
    await syncAll(juliTablet.deps);
    expect(Object.keys(juliTablet.state.groups)).toEqual([groupId]);
    expect(juliTablet.state.groups[groupId].meId).toBe(juli.group.meId);
  });

  it('leaving a group keeps the person in the accounts but removes access', async () => {
    const { server, juli, sofi, groupId } = await coupleOnline();
    const sofiPhone2 = device(server.as('uid-sofi'));
    await syncAll(sofiPhone2.deps);

    await leaveGroup(sofi.deps, groupId);
    expect(sofi.state.groups).toEqual({});
    await syncAll(sofiPhone2.deps);
    expect(sofiPhone2.state.groups).toEqual({});

    await syncAll(juli.deps);
    const sofiMember = juli.group.members.find((m) => m.name === 'Sofi')!;
    expect(sofiMember.userId).toBeUndefined();
    expect(juli.group.members).toHaveLength(2);
  });

  it('local-only groups never touch the server', async () => {
    const server = new FakeServer();
    const phone = device(server.as('uid-x'));
    phone.add(demoGroup());
    const e = expense(phone.group, {});
    phone.mutate((g) => ({ ...g, expenses: [...g.expenses, e] }), [['expenses', e.id]]);
    expect(phone.state.outbox).toEqual({});
    await syncAll(phone.deps);
    expect(Object.keys(phone.state.groups)).toHaveLength(1);
  });
});
