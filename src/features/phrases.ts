import { memberById } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import type { Group, Transfer } from '@/domain/types';

/** Titular del saldo desde el punto de vista de "yo". */
export function balanceHeadline(group: Group, transfers: Transfer[]): { label: string; amount?: number; tone: 'owed' | 'owes' | 'even' | 'others' } {
  const me = group.meId;
  const owedToMe = transfers.filter((t) => t.to === me);
  const iOwe = transfers.filter((t) => t.from === me);
  const name = (id: string) => memberById(group, id)?.name ?? '?';

  if (transfers.length === 0) return { label: group.members.length === 2 ? 'Están parejos ✨' : 'Todos parejos ✨', tone: 'even' };
  if (owedToMe.length === 1 && iOwe.length === 0) return { label: `${name(owedToMe[0].from)} te debe`, amount: owedToMe[0].amount, tone: 'owed' };
  if (owedToMe.length > 1) return { label: 'Te deben en total', amount: owedToMe.reduce((a, t) => a + t.amount, 0), tone: 'owed' };
  if (iOwe.length === 1) return { label: `Le debés a ${name(iOwe[0].to)}`, amount: iOwe[0].amount, tone: 'owes' };
  if (iOwe.length > 1) return { label: 'Debés en total', amount: iOwe.reduce((a, t) => a + t.amount, 0), tone: 'owes' };
  return { label: 'Vos estás parejo', tone: 'others' };
}

/** Recordatorio con onda para mandar por WhatsApp, sin pelear. */
export function reminderMessage(group: Group, transfer: Transfer): string {
  const from = memberById(group, transfer.from);
  const to = memberById(group, transfer.to);
  const amount = formatMoney(transfer.amount, group.currency);
  const alias = to?.alias ? `\nMi alias: ${to.alias}` : '';
  return `Hola ${from?.name ?? ''}! 👋 Para quedar parejos en "${group.name}" me faltaría que me pases ${amount}.${alias}\n¡Gracias! 💜\n\n— Calculado con Parejo`;
}

/** Explica en criollo cómo queda alguien en un gasto. */
export function impactLabel(paidBy: string, shares: Record<string, number>, total: number, meId: string, payerName: string, currency: Group['currency']) {
  const myShare = shares[meId] ?? 0;
  if (paidBy === meId) {
    const lent = total - myShare;
    return lent > 0 ? { text: `te deben ${formatMoney(lent, currency)}`, tone: 'positive' as const } : { text: 'gasto tuyo', tone: 'secondary' as const };
  }
  return myShare > 0
    ? { text: `le debés ${formatMoney(myShare, currency)} a ${payerName}`, tone: 'negative' as const }
    : { text: 'no te toca', tone: 'secondary' as const };
}
