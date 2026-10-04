import { daysBetween } from './dates';

/** Precio y condiciones de Parejo Pro. El cobro real lo hace el servidor (ver api/mp). */
export const PRO = {
  priceUsdYear: 35,
  trialDays: 14,
} as const;

/** Lo que incluye el plan gratis. Pro no tiene tope. */
export const FREE_LIMITS = {
  budgets: 2,
  tags: 5,
  voicePerMonth: 10,
} as const;

export type ProFeature = 'mercadopago' | 'voice' | 'budgets' | 'tags' | 'insights' | 'excel';

export const PRO_FEATURES: { id: ProFeature; icon: string; title: string; body: string }[] = [
  { id: 'mercadopago', icon: '💸', title: 'Integración con Mercado Pago', body: 'Tus pagos entran solos: los revisás y se cargan en un toque.' },
  { id: 'voice', icon: '🎙️', title: 'Carga por voz sin límite', body: '“15 lucas en el súper, pagó Sofi” y listo.' },
  { id: 'tags', icon: '🏷️', title: 'Etiquetas y presupuestos sin tope', body: 'Organizá por viaje, evento o lo que quieran, con topes por categoría.' },
  { id: 'insights', icon: '📈', title: 'Insights detallados', body: 'Tendencias, proyección del mes, cuotas comprometidas y más.' },
  { id: 'excel', icon: '📊', title: 'Exportación a Excel', body: 'Todos los gastos, cuotas y pagos en una planilla.' },
];

export type Profile = { trialStartedAt: string | null; proUntil: string | null };

export type Plan = {
  tier: 'free' | 'trial' | 'pro';
  /** Hasta cuándo dura la prueba o el Pro (ISO). */
  until: string | null;
  daysLeft: number | null;
  /** Si todavía puede empezar la prueba gratis. */
  canStartTrial: boolean;
  /** Pro porque lo paga otra persona del grupo. */
  shared: boolean;
};

export const FREE_PLAN: Plan = { tier: 'free', until: null, daysLeft: null, canStartTrial: true, shared: false };

export function trialEnd(trialStartedAt: string): string {
  return new Date(Date.parse(trialStartedAt) + PRO.trialDays * 86_400_000).toISOString();
}

/**
 * Plan efectivo: el propio, o el del grupo si alguien del grupo tiene Pro (Pro es para los dos).
 * `groupUntil` es la fecha de vencimiento más lejana entre las otras personas del grupo.
 */
export function resolvePlan(profile: Profile | null, now: Date, groupUntil: string | null = null): Plan {
  const nowIso = now.toISOString();
  const active = (until: string | null) => (until && until > nowIso ? until : null);
  const pro = active(profile?.proUntil ?? null);
  const trial = profile?.trialStartedAt ? active(trialEnd(profile.trialStartedAt)) : null;
  const group = active(groupUntil);
  const days = (until: string) => Math.max(0, daysBetween(nowIso.slice(0, 10), until.slice(0, 10)));
  const canStartTrial = !profile?.trialStartedAt && !pro;

  if (pro) return { tier: 'pro', until: pro, daysLeft: days(pro), canStartTrial: false, shared: false };
  if (group && (!trial || group > trial)) return { tier: 'pro', until: group, daysLeft: days(group), canStartTrial, shared: true };
  if (trial) return { tier: 'trial', until: trial, daysLeft: days(trial), canStartTrial: false, shared: false };
  return { ...FREE_PLAN, canStartTrial };
}

export function isPro(plan: Plan): boolean {
  return plan.tier !== 'free';
}

/** ¿Se puede agregar uno más de algo con tope en el plan gratis? */
export function withinLimit(plan: Plan, feature: 'budgets' | 'tags' | 'voicePerMonth', used: number): boolean {
  return isPro(plan) || used < FREE_LIMITS[feature];
}

/** Precio mensual equivalente, para mostrar "sale USD 2,92 por mes". */
export function monthlyEquivalent(perYear: number): string {
  return (Math.round((perYear / 12) * 100) / 100).toFixed(2).replace('.', ',');
}
