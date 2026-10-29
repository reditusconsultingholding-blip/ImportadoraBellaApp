import { db } from "@/lib/db";
import { diaEcuador } from "@/lib/control-publicitario";
import type { Platform } from "@/generated/prisma/client";

/**
 * La salud de las cuentas publicitarias: las dos formas de quedarse sin datos.
 *
 * Las dos son silenciosas y las dos cuestan plata. Una es que la cuenta deje de
 * ENTREGAR números —se cayó la conexión en Windsor—. La otra es que los
 * entregue pero sin una sola compra: la cuenta gasta todos los días y el panel
 * la ve como si no vendiera nada.
 *
 * POR QUÉ HIZO FALTA ESTO. El 16 de octubre Emilia avisó que «gotas de drenaje
 * linfático» mostraba una sola compra cuando el administrador de anuncios
 * mostraba veintidós. No era el producto: la cuenta entera —CP1 Top Ventas, la
 * que más gastaba de las doce, $437 el último día— llevaba cuatro días sin
 * entregarle una fila a Windsor. Nadie se enteró en cuatro días porque las
 * tres pantallas donde uno miraría decían que todo iba bien.
 *
 * LA ALARMA QUE HABÍA SOLO MIRABA EL CONECTOR ENTERO. Si Windsor no devuelve
 * NINGUNA fila, salta (eso ya se arregló en octubre, ver windsor-sync.ts). Pero
 * si devuelve siete cuentas de diez, la respuesta es válida, la sincronización
 * termina sin error y el tablero queda en verde con un tercio del gasto de Meta
 * afuera. Un número incompleto y silencioso es peor que un error a la vista:
 * con él se decide escalar o apagar.
 *
 * QUÉ CUENTA COMO «CALLADA», Y POR QUÉ NO BASTA CON «HACE DÍAS QUE NO TRAE».
 * De las doce cuentas de Meta hay varias apagadas hace meses: una que no gasta
 * no tiene por qué traer nada, y avisar por ellas sería dejar el tablero rojo
 * para siempre, que es la forma más segura de que el equipo aprenda a ignorar
 * el rojo. Por eso se piden las dos cosas: que haya gastado hace poco —prueba
 * de que está viva— y que aun así lleve más de un día sin una sola fila.
 */

/** Cuántos días atrás se busca gasto para considerar que la cuenta está viva. */
const VENTANA_DIAS = 10;

/** Desde cuánto gasto en siete días vale la pena mirar si no registra compras. */
const GASTO_MINIMO_7D = 50;

/**
 * La regla, sola y sin base de datos para poder probarla.
 *
 * Las dos condiciones son necesarias. Sin la del gasto, las cuentas apagadas
 * hace meses —hay varias— dejarían el tablero en rojo para siempre, que es la
 * forma más segura de que el equipo aprenda a ignorar el rojo. Sin la de los
 * días, saltaría cada madrugada: a las doce y cinco el día en curso recién
 * empieza y todavía no tiene por qué existir, por eso se compara contra ayer y
 * no contra hoy.
 */
export function decidirCallada(diasSinDatos: number | null, diasSinGastar: number | null) {
  if (diasSinDatos === null || diasSinGastar === null) return false;
  return diasSinGastar <= VENTANA_DIAS && diasSinDatos > 1;
}

/**
 * La otra forma de quedarse sin datos: la cuenta entrega todo, menos ventas.
 *
 * Lo encontró una cuenta nueva el 29 de octubre, CP2 - Top Ventas: ocho días
 * gastando doscientos dólares diarios, treinta y un mil clics y CERO compras
 * registradas. Para el panel esa cuenta no vende: su gasto entra en el total de
 * Meta y sus compras no, así que el CPA general de la tienda sale peor del que
 * es. Nadie avisaba, porque datos llegaban —llegaban todos—; lo que no llegaba
 * era la conversión.
 *
 * NO DECIDE LA CAUSA, Y NO DEBE. Puede ser una cuenta de campañas a WhatsApp,
 * donde la venta ocurre en el chat y el píxel no tiene cómo verla —y entonces
 * no hay nada roto, pero sus números tampoco se pueden comparar con los de las
 * demás—; o puede ser el píxel mal configurado, y entonces sí hay algo roto.
 * Las dos se ven igual desde acá. La alarma afirma solo lo que se midió: gasta
 * y no registra ni una compra.
 *
 * EL PISO DE GASTO ES LO QUE LA HACE ÚTIL: sin él, cualquier cuenta con dos
 * dólares de prueba y sin ventas encendería el tablero todos los días.
 */
export function decidirCiega(gasto7d: number, compras7d: number, diasSinDatos: number | null) {
  // Si además está callada, el problema es la conexión y no la medición: no
  // tiene sentido decir que «no registra compras» algo que no registra nada.
  if (diasSinDatos === null || diasSinDatos > 1) return false;
  return gasto7d >= GASTO_MINIMO_7D && compras7d === 0;
}

export type EstadoDeCuenta = {
  id: string;
  nombre: string;
  platform: Platform;
  /** El último día del que hay números (YYYY-MM-DD), o null si nunca trajo. */
  ultimoDia: string | null;
  /** El último día en que gastó algo. Es lo que dice si la cuenta está viva. */
  ultimoDiaConGasto: string | null;
  /** Días enteros desde el último dato. */
  diasSinDatos: number | null;
  /** Venía gastando y dejó de entregar: hay que ir a mirar la conexión. */
  callada: boolean;
  /** Lo gastado en los últimos siete días. */
  gasto7d: number;
  /** Las compras que registró en esos mismos siete días. */
  compras7d: number;
  /** Gasta y no registra una sola compra: sus números no se pueden comparar. */
  ciega: boolean;
};

type Fila = {
  id: string;
  name: string;
  platform: Platform;
  ultimo: Date | null;
  ultimo_con_gasto: Date | null;
  gasto_7d: number | null;
  compras_7d: number | null;
};

const soloDia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * El estado de todas las cuentas publicitarias de una organización.
 *
 * Una sola consulta para las doce cuentas: esto lo pinta la pantalla de
 * Conexiones y lo mira el reloj en cada vuelta, así que no puede ser una
 * consulta por cuenta.
 */
export async function estadoDeLasCuentas(
  organizationId: string,
  ahora = new Date(),
): Promise<EstadoDeCuenta[]> {
  const filas = await db.$queryRaw<Fila[]>`
    select a.id,
           a.name,
           a.platform,
           max(m."capturedAt") as ultimo,
           max(m."capturedAt") filter (where m.spend > 0) as ultimo_con_gasto,
           coalesce(sum(m.spend) filter (where m."capturedAt" >= current_date - 7), 0) as gasto_7d,
           coalesce(sum(m.purchases) filter (where m."capturedAt" >= current_date - 7), 0) as compras_7d
      from "AdAccount" a
      left join "Campaign" c on c."adAccountId" = a.id
      left join "MetricSnapshot" m on m."campaignId" = c.id
     where a."organizationId" = ${organizationId}
     group by a.id, a.name, a.platform
     order by a.platform, a.name
  `;

  const hoy = diaEcuador(ahora).getTime();
  const DIA = 86_400_000;

  return filas.map((f) => {
    const ultimo = f.ultimo ? new Date(f.ultimo) : null;
    const conGasto = f.ultimo_con_gasto ? new Date(f.ultimo_con_gasto) : null;
    const diasSinDatos = ultimo ? Math.round((hoy - ultimo.getTime()) / DIA) : null;
    const diasSinGastar = conGasto ? Math.round((hoy - conGasto.getTime()) / DIA) : null;

    const callada = decidirCallada(diasSinDatos, diasSinGastar);
    const gasto7d = Number(f.gasto_7d ?? 0);
    const compras7d = Number(f.compras_7d ?? 0);

    return {
      id: f.id,
      nombre: f.name,
      platform: f.platform,
      ultimoDia: soloDia(ultimo),
      ultimoDiaConGasto: soloDia(conGasto),
      diasSinDatos,
      callada,
      gasto7d,
      compras7d,
      ciega: decidirCiega(gasto7d, compras7d, diasSinDatos),
    };
  });
}

/**
 * El aviso para el tablero, o null si no hay nada que avisar.
 *
 * Sale como texto y no como lista porque es lo que entra en el detalle de la
 * sincronización, que es donde el equipo lo va a leer. Nombra las cuentas: un
 * «hay cuentas sin datos» obliga a abrir otra pantalla para saber cuáles, y
 * en la práctica eso significa que nadie lo abre.
 *
 * Las dos fallas van en el mismo aviso y separadas por punto: son distintas y
 * se arreglan en lugares distintos —una en Windsor, la otra en la cuenta de
 * Meta—, así que juntarlas en una sola frase obligaría a leerla dos veces.
 */
export function avisoDeCuentasCalladas(estados: EstadoDeCuenta[], platform?: Platform) {
  const mias = estados.filter((e) => !platform || e.platform === platform);
  const partes: string[] = [];

  const calladas = mias.filter((e) => e.callada);
  if (calladas.length > 0) {
    const detalle = calladas
      .map((c) => `${c.nombre} (sin datos desde ${c.ultimoDia}, ${c.diasSinDatos} días)`)
      .join("; ");
    const una = calladas.length === 1;
    partes.push(
      `${calladas.length} cuenta${una ? "" : "s"} ${una ? "dejó" : "dejaron"} de entregar datos aunque ` +
        `${una ? "venía" : "venían"} gastando: ${detalle}. Windsor responde bien para las demás, así que hay ` +
        `que revisar esa conexión en Windsor.ai.`,
    );
  }

  const ciegas = mias.filter((e) => e.ciega);
  if (ciegas.length > 0) {
    const detalle = ciegas
      .map((c) => `${c.nombre} ($${Math.round(c.gasto7d)} en 7 días, 0 compras)`)
      .join("; ");
    const una = ciegas.length === 1;
    partes.push(
      `${ciegas.length} cuenta${una ? "" : "s"} gasta${una ? "" : "n"} y no registra${una ? "" : "n"} ` +
        `ninguna compra: ${detalle}. Su gasto entra en el total y sus ventas no, así que el CPA general sale ` +
        `peor del que es. Si son campañas a WhatsApp, la venta ocurre fuera de la web y el píxel no puede ` +
        `verla; si no, hay que revisar el píxel de esa cuenta.`,
    );
  }

  return partes.length > 0 ? partes.join(" ") : null;
}
