import { describe, expect, it } from 'vitest';

import { parseQuickExpense } from '../quick-add';
import type { Member } from '../types';

const members: Member[] = [
  { id: 'j', name: 'Juli', emoji: '🦊', color: '#000' },
  { id: 's', name: 'Sofía', emoji: '🐼', color: '#000' },
];
const parse = (text: string) => parseQuickExpense(text, members, 'j', '2026-10-04');

describe('quick add', () => {
  it.each([
    ['15 lucas en el súper', { amount: 15_000_00, description: 'Súper', category: 'super', paidBy: 'j' }],
    ['Gasté 12.500 en la verdulería', { amount: 12_500_00, description: 'Verdulería', category: 'super' }],
    ['pagó Sofía 30 mil de la cena', { amount: 30_000_00, paidBy: 's', description: 'Cena', category: 'food' }],
    ['Sofia pagó 8000 de farmacia', { amount: 8_000_00, paidBy: 's', category: 'health' }],
    ['heladera 600 mil en 6 cuotas', { amount: 600_000_00, installments: 6, description: 'Heladera' }],
    ['tele 1,5 palos en doce cuotas', { amount: 1_500_000_00, installments: 12 }],
    ['medio palo de alquiler', { amount: 500_000_00, category: 'home' }],
    ['dos lucas y media de helado', { amount: 2_500_00, category: 'food' }],
    ['ayer 100 dólares el airbnb, todo de Sofía', { amount: 100_00, currency: 'USD', date: '2026-10-03', split: { mode: 'full', memberId: 's' }, category: 'travel' }],
    ['anteayer uber 4500', { amount: 4_500_00, date: '2026-10-02', category: 'transport' }],
    ['$ 12.345,50 de luz, según ingresos', { amount: 12_345_50, category: 'services', split: { mode: 'income' } }],
    ['netflix 7999 a medias', { amount: 7_999_00, split: { mode: 'equal' }, category: 'subscriptions' }],
    ['rappi 25k', { amount: 25_000_00, category: 'delivery' }],
  ])('%s', (text, expected) => {
    expect(parse(text)).toMatchObject(expected);
  });

  it('leaves the amount empty when it is not said', () => {
    expect(parse('el súper')).toMatchObject({ amount: null, description: 'Súper' });
  });

  it('defaults to today, me, one payment and half each', () => {
    expect(parse('café 3000')).toEqual({
      amount: 3_000_00,
      currency: 'ARS',
      description: 'Café',
      category: 'food',
      paidBy: 'j',
      split: { mode: 'equal' },
      installments: 1,
      date: '2026-10-04',
    });
  });
});
