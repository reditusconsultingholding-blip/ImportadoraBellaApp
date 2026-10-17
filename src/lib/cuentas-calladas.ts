import { db } from "@/lib/db";
import { diaEcuador } from "@/lib/control-publicitario";
import type { Platform } from "@/generated/prisma/client";

/**
 * Cuentas publicitarias que venían trayendo números y se callaron.
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
};

type Fila = {
  id: string;
  name: string;
  platform: Platform;
  ultimo: Date | null;
  ultimo_con_gasto: Date | null;
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
           max(m."capturedAt") filter (where m.spend > 0) as ultimo_con_gasto
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

    return {
      id: f.id,
      nombre: f.name,
      platform: f.platform,
      ultimoDia: soloDia(ultimo),
      ultimoDiaConGasto: soloDia(conGasto),
      diasSinDatos,
      callada,
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
 */
export function avisoDeCuentasCalladas(estados: EstadoDeCuenta[], platform?: Platform) {
  const calladas = estados.filter((e) => e.callada && (!platform || e.platform === platform));
  if (calladas.length === 0) return null;
  const detalle = calladas
    .map((c) => `${c.nombre} (sin datos desde ${c.ultimoDia}, ${c.diasSinDatos} días)`)
    .join("; ");
  const una = calladas.length === 1;
  return (
    `${calladas.length} cuenta${una ? "" : "s"} ${una ? "dejó" : "dejaron"} de entregar datos aunque ` +
    `${una ? "venía" : "venían"} gastando: ${detalle}. Windsor responde bien para las demás, así que hay que ` +
    `revisar esa conexión en Windsor.ai.`
  );
}
