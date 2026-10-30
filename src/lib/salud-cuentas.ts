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
 *
 * Y LA ALARMA NO SE CIERRA CON EL CALENDARIO. La ventana de diez días mide si
 * la cuenta estaba viva, pero se cuenta desde hoy: una cuenta caída dejaba de
 * avisar al undécimo día —no porque alguien la hubiera arreglado, sino porque
 * el tiempo pasó— y volvía a ser invisible. Lo iba a hacer con CP3 Top Ventas,
 * que se cayó el 21 de octubre: el 30 habría desaparecido del aviso con la
 * conexión todavía rota. Por eso, una vez abierta (`yaEstabaCallada`, que viene
 * de la base), la alarma sigue abierta mientras no haya datos. La cierran los
 * datos que vuelven, o una persona que declara que la cuenta está apagada a
 * propósito. Nunca el reloj.
 */
export function decidirCallada(
  diasSinDatos: number | null,
  diasSinGastar: number | null,
  yaEstabaCallada = false,
) {
  if (diasSinDatos === null) return false;
  if (diasSinDatos <= 1) return false; // volvieron los datos: la alarma se cierra
  if (yaEstabaCallada) return true;
  if (diasSinGastar === null) return false;
  return diasSinGastar <= VENTANA_DIAS;
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
  /** El ad_account_id de Meta o el advertiser_id de TikTok: va en los pasos. */
  externalId: string;
  /** El último día del que hay números (YYYY-MM-DD), o null si nunca trajo. */
  ultimoDia: string | null;
  /** El último día en que gastó algo. Es lo que dice si la cuenta está viva. */
  ultimoDiaConGasto: string | null;
  /** Días enteros desde el último dato. */
  diasSinDatos: number | null;
  /**
   * El hecho crudo: venía gastando y dejó de entregar datos.
   *
   * Se guarda aparte de `callada` para que marcar una cuenta como apagada a
   * propósito silencie el aviso sin borrar lo que se midió. Si no, al quitarle
   * el silencio la ventana de diez días ya habría caducado y la caída —todavía
   * sin arreglar— no volvería a abrirse nunca.
   */
  caida: boolean;
  /** Lo mismo, ya descontado el silencio: esto es lo que se avisa. */
  callada: boolean;
  /** Lo gastado en los últimos siete días. */
  gasto7d: number;
  /** Las compras que registró en esos mismos siete días. */
  compras7d: number;
  /** Gasta y no registra una sola compra: sus números no se pueden comparar. */
  ciega: boolean;
  /**
   * Lo que venía gastando por día antes de callarse.
   *
   * Es lo que convierte el aviso técnico en uno de negocio: «CP3 no entrega
   * datos» se posterga, «faltan 180 dólares por día del gasto que estás
   * mirando» no. Null si no se puede calcular.
   */
  gastoDiarioPrevio: number | null;
  /** La caída ya quedó anotada en la base, así que el calendario no la cierra. */
  anotada: boolean;
  /** Alguien declaró que está apagada a propósito: el aviso queda callado. */
  apagadaAdrede: boolean;
  /** Alguien declaró que vende por WhatsApp: el aviso de sin compras se calla. */
  ventaFueraDeLaWeb: boolean;
};

type Fila = {
  id: string;
  name: string;
  platform: Platform;
  external_id: string;
  ultimo: Date | null;
  ultimo_con_gasto: Date | null;
  gasto_7d: number | null;
  compras_7d: number | null;
  gasto_previo: number | null;
  callada_desde: Date | null;
  apagada_at: Date | null;
  venta_fuera_web_at: Date | null;
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
    with cuentas as (
      select a.id,
             a.name,
             a.platform,
             a."externalId" as external_id,
             a."calladaDesde" as callada_desde,
             a."apagadaAt" as apagada_at,
             a."ventaFueraWebAt" as venta_fuera_web_at,
             max(m."capturedAt") as ultimo,
             max(m."capturedAt") filter (where m.spend > 0) as ultimo_con_gasto,
             coalesce(sum(m.spend) filter (where m."capturedAt" >= current_date - 7), 0) as gasto_7d,
             coalesce(sum(m.purchases) filter (where m."capturedAt" >= current_date - 7), 0) as compras_7d
        from "AdAccount" a
        left join "Campaign" c on c."adAccountId" = a.id
        left join "MetricSnapshot" m on m."campaignId" = c.id
       where a."organizationId" = ${organizationId}
       group by a.id, a.name, a.platform, a."externalId", a."calladaDesde", a."apagadaAt", a."ventaFueraWebAt"
    )
    select cuentas.*, previo.gasto_previo
      from cuentas
      -- Los siete días ANTERIORES al último, sin incluirlo: el día en que se
      -- corta suele entrar a medias —el 12 de octubre CP1 trajo una fracción
      -- de los $437 que iba gastando— y meterlo en el promedio hunde justo el
      -- número que se quiere usar para dimensionar lo que falta.
      left join lateral (
        select coalesce(sum(m.spend), 0) as gasto_previo
          from "Campaign" c
          join "MetricSnapshot" m on m."campaignId" = c.id
         where c."adAccountId" = cuentas.id
           and m."capturedAt" >= cuentas.ultimo - interval '7 days'
           and m."capturedAt" < cuentas.ultimo
      ) previo on true
     order by cuentas.platform, cuentas.name
  `;

  const hoy = diaEcuador(ahora).getTime();
  const DIA = 86_400_000;

  return filas.map((f) => {
    const ultimo = f.ultimo ? new Date(f.ultimo) : null;
    const conGasto = f.ultimo_con_gasto ? new Date(f.ultimo_con_gasto) : null;
    const diasSinDatos = ultimo ? Math.round((hoy - ultimo.getTime()) / DIA) : null;
    const diasSinGastar = conGasto ? Math.round((hoy - conGasto.getTime()) / DIA) : null;

    // La alarma que ya estaba abierta en la base no se vuelve a juzgar por la
    // ventana de diez días: solo la cierran los datos o una persona.
    const caida = decidirCallada(diasSinDatos, diasSinGastar, f.callada_desde != null);
    const gasto7d = Number(f.gasto_7d ?? 0);
    const compras7d = Number(f.compras_7d ?? 0);
    const previo = Number(f.gasto_previo ?? 0);

    // Los dos silencios son declaraciones de una persona, y se guardan tal
    // cual. Lo que decide si todavía valen es `anotarSaludDeCuentas`, que los
    // levanta cuando el hecho que los justificaba deja de ser cierto: una
    // cuenta «apagada» que vuelve a entregar datos está encendida otra vez.
    const apagadaAdrede = f.apagada_at != null;
    const ventaFueraDeLaWeb = f.venta_fuera_web_at != null;

    return {
      id: f.id,
      nombre: f.name,
      platform: f.platform,
      externalId: f.external_id,
      ultimoDia: soloDia(ultimo),
      ultimoDiaConGasto: soloDia(conGasto),
      diasSinDatos,
      caida,
      callada: caida && !apagadaAdrede,
      gasto7d,
      compras7d,
      ciega: decidirCiega(gasto7d, compras7d, diasSinDatos) && !ventaFueraDeLaWeb,
      gastoDiarioPrevio: previo > 0 ? previo / 7 : null,
      anotada: f.callada_desde != null,
      apagadaAdrede,
      ventaFueraDeLaWeb,
    };
  });
}

/**
 * Anota las caídas y levanta los silencios cuando dejan de tener razón.
 *
 * Lo llama el reloj después de cada sincronización. Es lo que hace que la
 * alarma no dependa del calendario: la caída queda escrita, y a partir de ahí
 * sigue en pie mientras no entren datos, aunque la cuenta lleve tanto tiempo
 * sin gastar que la ventana de diez días ya no la considere viva.
 *
 * Los dos silencios se levantan solos, y es a propósito: una cuenta que alguien
 * declaró apagada y de pronto vuelve a entregar datos está encendida otra vez y
 * hay que volver a vigilarla. Lo mismo con la de WhatsApp en cuanto registra
 * una compra por la web.
 */
export async function anotarSaludDeCuentas(estados: EstadoDeCuenta[]) {
  // Se anota el hecho crudo, no el aviso: una cuenta silenciada igual dejó de
  // entregar datos, y si mañana se le quita el silencio la caída tiene que
  // seguir ahí.
  const nuevas = estados.filter((e) => e.caida && !e.anotada && e.ultimoDia);
  for (const e of nuevas) {
    await db.adAccount.update({
      where: { id: e.id },
      data: { calladaDesde: new Date(`${e.ultimoDia}T00:00:00Z`) },
    });
  }

  // Volvieron los datos: se borra la anotación y también el «está apagada a
  // propósito», que ya no describe nada.
  const volvieron = estados.filter(
    (e) => e.diasSinDatos != null && e.diasSinDatos <= 1 && (e.anotada || e.apagadaAdrede),
  );
  for (const e of volvieron) {
    await db.adAccount.update({
      where: { id: e.id },
      data: { calladaDesde: null, apagadaAt: null, apagadaPor: null },
    });
  }

  const yaVende = estados.filter((e) => e.ventaFueraDeLaWeb && e.compras7d > 0);
  for (const e of yaVende) {
    await db.adAccount.update({
      where: { id: e.id },
      data: { ventaFueraWebAt: null, ventaFueraWebPor: null },
    });
  }

  return { anotadas: nuevas.length, cerradas: volvieron.length };
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
      .map((c) => {
        // Cuánto gasto por día quedó afuera del tablero. Es el dato que hace
        // que el aviso se atienda hoy en vez de la semana que viene.
        //
        // Se dice «lo último que se le vio» y no «venía gastando»: es el
        // promedio de los días ANTERIORES al corte, y lo que la cuenta gaste
        // desde entonces no se puede saber desde acá. Decirlo como si fuera el
        // gasto de hoy haría parecer chico un agujero que puede ser grande.
        const plata =
          c.gastoDiarioPrevio != null
            ? `, lo último que se le vio gastar fueron ~$${Math.round(c.gastoDiarioPrevio)}/día`
            : "";
        return `${c.nombre} (sin datos desde ${c.ultimoDia}, ${c.diasSinDatos} días${plata})`;
      })
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
