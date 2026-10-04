# Parejo — producto

> **Del “después te paso” al “estamos parejos”.**
> Cuentas claras para vivir juntos: gastos compartidos, cuotas, fijos del mes y metas en pareja.

## El problema

Apps como Kesef resuelven muy bien una pregunta: **¿quién le debe a quién?**
Pero la plata en pareja (o en un depto compartido) es mucho más que eso, y en Argentina tiene sus propias complicaciones:

| Dolor real | Qué pasa hoy |
| --- | --- |
| **Las cuotas.** La heladera en 12 cuotas, el pasaje en 6. | Se carga el total el día de la compra (y el saldo queda desfasado) o alguien lleva la cuenta en un Excel. |
| **Los fijos.** Alquiler, expensas, luz, internet, streaming. | “¿Pagaste la luz?” por WhatsApp todos los meses. Se vence algo y nadie sabe quién tenía que pagarlo. |
| **El 50/50 no siempre es justo.** | Si uno gana el doble, partir todo a la mitad genera tensión. No hay forma simple de dividir proporcionalmente. |
| **Pesos y dólares.** | El Airbnb en dólares, el súper en pesos. Las apps de afuera no lo resuelven. |
| **Los proyectos en común.** | El viaje, la mudanza, el fondo de emergencia viven en la cabeza de uno o en otra app. |
| **Cobrar sin pelear.** | Recordarle a tu pareja que te debe plata es incómodo. |

## La propuesta: el “sistema operativo” de la plata en pareja

Parejo hace todo lo que hace Kesef **y además**:

1. **💳 Cuotas que se reparten solas.** Cargás “Heladera, $1.440.000 en 6 cuotas” una vez. Cada mes se suma solo la cuota correspondiente al saldo. En el inicio ves cuánto queda en cuotas futuras.
2. **📅 Fijos del mes.** Definís alquiler, expensas, luz… con día de vencimiento, monto estimado, quién lo suele pagar y cómo se divide. Parejo muestra qué está pago, qué vence pronto y qué está vencido. Registrar el pago es un toque, y queda sumado a las cuentas.
3. **📐 División justa según ingresos.** Además de mitad y mitad, todo de uno o porcentajes, cada gasto se puede dividir en proporción a lo que gana cada uno.
4. **🎯 Metas en pareja.** Ahorro compartido con objetivo, fecha y ritmo necesario por mes, en pesos o dólares, con cuánto aportó cada uno y un aporte sugerido según la regla del grupo.
5. **💵 Pesos y dólares.** Cada gasto se carga en su moneda con la cotización del momento.
6. **🤝 Saldar sin pelear.** Mínima cantidad de transferencias, alias para copiar, pagos parciales y un **“Recordar con onda”** que arma un mensaje amable listo para WhatsApp (y de paso hace conocer la app).
7. **📊 Resumen del mes.** En qué se fue la plata, comparación con el mes anterior, cuánto puso cada uno contra lo que le tocaba, y cuánto del mes son cuotas viejas. Es la “charla de plata” del mes, pero sin discutir.

Funciona para **parejas** (el foco), **deptos compartidos** y **viajes**.

## Estado actual (MVP en este repo)

Todo lo de arriba está implementado y funcionando en web, iOS y Android desde un solo código (Expo):

- Bienvenida, creación de grupo (pareja, depto, viaje) y **datos de ejemplo** para probar al instante.
- Inicio con saldo, acciones de saldar y recordar, fijos pendientes, resumen del mes, metas y últimos movimientos.
- Cargar y editar gastos: monto, moneda, categoría (se sugiere sola a partir de la descripción), quién pagó, cómo se divide, cuotas, fecha y vista previa de cómo queda.
- Historial con búsqueda y filtro por categoría, detalle de cada gasto con el desglose de cuotas.
- Fijos, metas, resumen mensual, ajustes (personas, ingresos, alias, dólar de referencia, varios grupos, exportar copia).
- Modo claro y oscuro.
- Lógica de dominio pura y testeada (`src/domain`): reparto sin perder centavos, cuotas, saldos, simplificación de deudas, fijos, metas y resúmenes.

- **Juntos de verdad (fase 2, hecha):** entrar con código por email, invitar a la pareja por link, sincronización en tiempo real entre celulares y web, y uso sin conexión. Detalle en [`SINCRONIZACION.md`](SINCRONIZACION.md).

## Hoja de ruta

### Fase 2 — Juntos de verdad ✅
- ✅ Cuentas con código por email e **invitación por link** a la pareja o al grupo.
- ✅ Sincronización en tiempo real con soporte offline.
- Pendiente: entrar con Google/Apple, links que abran la app instalada y notificaciones push (“Sofi cargó Súper $45.000”, “Mañana vence la luz”, “Ya pueden saldar el mes”).

### Plus y web instalable ✅
- ✅ Parejo Plus: una suscripción para todo el grupo, USD 1,99/mes o USD 14,99/año, primer mes gratis sin tarjeta, cobro por Mercado Pago.
- ✅ Mercado Pago: conectar la cuenta y revisar los pagos en una bandeja.
- ✅ Carga por voz y texto natural, etiquetas, presupuestos, insights detallados y exportación a Excel.
- ✅ Web instalable (PWA) en Vercel. Ver [`VERCEL_Y_PLUS.md`](VERCEL_Y_PLUS.md).

### Fase 3 — Lo que nos hace distintos
- **Cotización automática** del dólar (blue/MEP/tarjeta) al cargar en USD.
- **Cargar sin tipear:** foto del ticket o de la factura (IA lee monto, comercio, categoría y cuotas), por voz o reenviando un mensaje.
- **Importar el resumen de la tarjeta** (PDF): detecta compras y cuotas y propone cuáles son compartidas.
- **Cierre de mes:** un ritual mensual con resumen, saldar y “¿cómo nos sentimos con la plata este mes?”.
- Links de pago (Mercado Pago) para saldar en un toque.
- Widgets de inicio (saldo y próximo vencimiento) y atajos.

### Fase 4 — Crecimiento
- Sumar a Plus: foto del ticket con IA, importación del resumen de la tarjeta, temas.
- Gratis para siempre: grupos, gastos, saldos, cuotas y fijos básicos.
- Modo viaje con varias monedas y deudas entre muchos.

## Métricas que importan
- Activación: % de grupos con **2 miembros activos** en los primeros 7 días.
- Retención semanal de grupos (no de usuarios).
- Gastos cargados por grupo por semana.
- % de grupos que saldan al menos una vez por mes.
- Viralidad: recordatorios compartidos → instalaciones.

## Posicionamiento y lanzamiento
- Gancho: *“El ‘después te paso’ destruyó más parejas que cualquier otra cosa.”*
- Contenido corto (TikTok/Reels/X) con situaciones reales: la heladera en cuotas, “¿pagaste la luz?”, “vos ganás más, ¿por qué 50/50?”.
- El recordatorio de WhatsApp lleva la firma “Calculado con Parejo”: cada cobro es una recomendación.
