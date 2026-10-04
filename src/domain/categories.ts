export type Category = { id: string; label: string; emoji: string; color: string };

export const CATEGORIES: Category[] = [
  { id: 'super', label: 'Súper', emoji: '🛒', color: '#2FB67C' },
  { id: 'home', label: 'Casa', emoji: '🏠', color: '#5B4CF0' },
  { id: 'services', label: 'Servicios', emoji: '💡', color: '#F2A93B' },
  { id: 'food', label: 'Comida afuera', emoji: '🍕', color: '#FF6B5B' },
  { id: 'delivery', label: 'Delivery', emoji: '🛵', color: '#E8547A' },
  { id: 'transport', label: 'Transporte', emoji: '🚕', color: '#3AA0E8' },
  { id: 'outings', label: 'Salidas', emoji: '🎬', color: '#9B5DE5' },
  { id: 'travel', label: 'Viajes', emoji: '✈️', color: '#00B2CA' },
  { id: 'health', label: 'Salud', emoji: '💊', color: '#EF476F' },
  { id: 'pets', label: 'Mascotas', emoji: '🐶', color: '#B08968' },
  { id: 'gifts', label: 'Regalos', emoji: '🎁', color: '#F15BB5' },
  { id: 'subscriptions', label: 'Suscripciones', emoji: '📺', color: '#7B8794' },
  { id: 'other', label: 'Otros', emoji: '✨', color: '#8D99AE' },
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return BY_ID[id] ?? BY_ID.other;
}

/** Sugiere una categoría a partir de la descripción, para cargar más rápido. */
export function guessCategory(description: string): string | null {
  const text = description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const rules: [RegExp, string][] = [
    [/super|chino|coto|carrefour|dia\b|jumbo|disco|verduler|carnicer|almacen|mercado\b/, 'super'],
    [/alquiler|expensa|mueble|ferreter|limpieza|ikea|easy|sodimac/, 'home'],
    [/luz|gas\b|agua|internet|wifi|telefono|celular|edenor|edesur|metrogas|aysa|fibertel|personal|movistar|claro/, 'services'],
    [/rappi|pedidosya|pedidos ya|delivery/, 'delivery'],
    [/resto|restaurant|cena|almuerzo|pizza|birra|cerveza|bar\b|cafe|brunch|helado|sushi|burger|parrilla/, 'food'],
    [/uber|cabify|didi|taxi|nafta|sube|peaje|estacionamiento|colectivo|tren|subte/, 'transport'],
    [/cine|teatro|recital|show|entrada|boliche/, 'outings'],
    [/vuelo|hotel|airbnb|pasaje|viaje|hostel|booking|despegar/, 'travel'],
    [/farmacia|medic|doctor|prepaga|osde|swiss|galeno|dentista|psico/, 'health'],
    [/veterin|perro|gato|mascota|alimento balanceado/, 'pets'],
    [/regalo|cumple/, 'gifts'],
    [/netflix|spotify|disney|hbo|max\b|prime|youtube|icloud|google one|chatgpt|claude/, 'subscriptions'],
  ];
  for (const [re, id] of rules) if (re.test(text)) return id;
  return null;
}
