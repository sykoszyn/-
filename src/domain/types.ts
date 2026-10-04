/**
 * Modelo de dominio de Parejo.
 *
 * Todos los montos se guardan como enteros en centavos para evitar errores de
 * punto flotante. Las fechas son strings ISO `YYYY-MM-DD` y los meses `YYYY-MM`.
 */

export type Currency = 'ARS' | 'USD';

export type GroupKind = 'couple' | 'home' | 'trip' | 'other';

export type Member = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** Ingreso mensual neto, en centavos de la moneda del grupo. Se usa para la división proporcional. */
  income?: number;
  /** Alias / CVU para recibir transferencias. */
  alias?: string;
};

/**
 * Cómo se reparte un gasto.
 * - equal: partes iguales entre `memberIds` (o todos si no se especifica).
 * - income: proporcional al ingreso de cada uno.
 * - custom: porcentajes (o pesos relativos) por miembro en `weights`.
 * - full: todo el gasto le corresponde a `memberIds[0]` (p. ej. "lo pagué yo pero es tuyo").
 */
export type Split =
  | { mode: 'equal'; memberIds?: string[] }
  | { mode: 'income' }
  | { mode: 'custom'; weights: Record<string, number> }
  | { mode: 'full'; memberId: string };

export type Expense = {
  id: string;
  description: string;
  /** Monto total en centavos de `currency`. */
  amount: number;
  currency: Currency;
  /** Unidades de la moneda del grupo por 1 unidad de `currency`. 1 si es la misma moneda. */
  rate: number;
  paidBy: string;
  split: Split;
  category: string;
  /** Fecha de la compra. La primera cuota cae en este mes. */
  date: string;
  /** Cantidad de cuotas (1 = pago único). */
  installments: number;
  /** Si el gasto salió de un fijo del mes. */
  billId?: string;
  createdAt: number;
};

export type Settlement = {
  id: string;
  from: string;
  to: string;
  /** Centavos en la moneda del grupo. */
  amount: number;
  date: string;
  note?: string;
  createdAt: number;
};

/** Un gasto fijo que se repite todos los meses (alquiler, expensas, luz, Netflix...). */
export type Bill = {
  id: string;
  name: string;
  emoji: string;
  /** Monto estimado en centavos de la moneda del grupo (0 = variable). */
  amount: number;
  /** Día del mes en que vence (1-31). */
  dueDay: number;
  category: string;
  split: Split;
  /** Quién suele pagarlo. */
  payerId?: string;
  active: boolean;
  createdAt: number;
};

export type GoalContribution = {
  id: string;
  memberId: string;
  /** Centavos en la moneda de la meta. Puede ser negativo (retiro). */
  amount: number;
  date: string;
};

/** Una meta de ahorro compartida (el viaje, la mudanza, el fondo de emergencia...). */
export type Goal = {
  id: string;
  name: string;
  emoji: string;
  target: number;
  currency: Currency;
  deadline?: string;
  contributions: GoalContribution[];
  createdAt: number;
};

export type Group = {
  id: string;
  name: string;
  kind: GroupKind;
  currency: Currency;
  members: Member[];
  /** Quién soy yo en este grupo (para hablar en segunda persona). */
  meId: string;
  expenses: Expense[];
  settlements: Settlement[];
  bills: Bill[];
  goals: Goal[];
  /** Cotización de referencia del dólar (ARS por USD) para cargar gastos en dólares. */
  usdRate: number;
  createdAt: number;
};

export type Transfer = { from: string; to: string; amount: number };
