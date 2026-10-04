import { daysBetween } from './dates';

/**
 * Parejo Plus: una sola suscripción para todo el grupo (la pareja, el depto, el viaje).
 * Precios de referencia en dólares; Mercado Pago cobra en pesos (ver api/mp y PLUS_PRICE_ARS_*).
 */
export const PLUS = {
  name: 'Parejo Plus',
  trialDays: 30,
  prices: { month: 1.99, year: 14.99 },
} as const;

export type BillingPeriod = keyof typeof PLUS.prices;

/** El plan gratis alcanza para el día a día; Plus saca los topes. */
export const FREE_LIMITS = {
  budgets: 3,
  tags: 10,
  voicePerMonth: 15,
} as const;

export type PlusFeature = 'mercadopago' | 'voice' | 'budgets' | 'tags' | 'insights' | 'excel';

export const PLUS_FEATURES: { id: PlusFeature; icon: string; title: string; body: string }[] = [
  { id: 'mercadopago', icon: '🧾', title: 'Mercado Pago conectado', body: 'Tus pagos aparecen en una bandeja y elegís cuáles son compartidos.' },
  { id: 'voice', icon: '🎙️', title: 'Dictado ilimitado', body: 'Cargá gastos hablando, todas las veces que quieras.' },
  { id: 'tags', icon: '🗂️', title: 'Orden a su medida', body: 'Todas las etiquetas y presupuestos que necesiten.' },
  { id: 'insights', icon: '🔮', title: 'Lo que viene y lo que fue', body: 'Cómo cierra el mes, las cuotas que se vienen y sus tendencias.' },
  { id: 'excel', icon: '📑', title: 'Sus números en Excel', body: 'Una planilla con todo, para guardar o compartir.' },
];

export type Profile = { trialStartedAt: string | null; proUntil: string | null };

export type Plan = {
  tier: 'free' | 'trial' | 'plus';
  /** Hasta cuándo dura la prueba o Plus (ISO). */
  until: string | null;
  daysLeft: number | null;
  /** Si todavía puede empezar la prueba gratis. */
  canStartTrial: boolean;
  /** Plus porque lo paga otra persona del grupo. */
  shared: boolean;
};

export const FREE_PLAN: Plan = { tier: 'free', until: null, daysLeft: null, canStartTrial: true, shared: false };

export function trialEnd(trialStartedAt: string): string {
  return new Date(Date.parse(trialStartedAt) + PLUS.trialDays * 86_400_000).toISOString();
}

/**
 * Plan efectivo: el propio, o el del grupo si alguien del grupo tiene Plus (una suscripción alcanza para todos).
 * `groupUntil` es la fecha de vencimiento más lejana entre las otras personas del grupo.
 */
export function resolvePlan(profile: Profile | null, now: Date, groupUntil: string | null = null): Plan {
  const nowIso = now.toISOString();
  const active = (until: string | null) => (until && until > nowIso ? until : null);
  const paid = active(profile?.proUntil ?? null);
  const trial = profile?.trialStartedAt ? active(trialEnd(profile.trialStartedAt)) : null;
  const group = active(groupUntil);
  const days = (until: string) => Math.max(0, daysBetween(nowIso.slice(0, 10), until.slice(0, 10)));
  const canStartTrial = !profile?.trialStartedAt && !paid;

  if (paid) return { tier: 'plus', until: paid, daysLeft: days(paid), canStartTrial: false, shared: false };
  if (group && (!trial || group > trial)) return { tier: 'plus', until: group, daysLeft: days(group), canStartTrial, shared: true };
  if (trial) return { tier: 'trial', until: trial, daysLeft: days(trial), canStartTrial: false, shared: false };
  return { ...FREE_PLAN, canStartTrial };
}

export function hasPlus(plan: Plan): boolean {
  return plan.tier !== 'free';
}

/** ¿Se puede agregar uno más de algo con tope en el plan gratis? */
export function withinLimit(plan: Plan, feature: 'budgets' | 'tags' | 'voicePerMonth', used: number): boolean {
  return hasPlus(plan) || used < FREE_LIMITS[feature];
}

/** "1,99" */
export function usd(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

/** Cuánto sale por mes el plan anual ("1,25") y cuánto se ahorra contra pagar mes a mes (37). */
export function yearlyDeal(): { perMonth: string; savingPercent: number } {
  const perMonth = Math.round((PLUS.prices.year / 12) * 100) / 100;
  return { perMonth: usd(perMonth), savingPercent: Math.round((1 - PLUS.prices.year / (PLUS.prices.month * 12)) * 100) };
}
