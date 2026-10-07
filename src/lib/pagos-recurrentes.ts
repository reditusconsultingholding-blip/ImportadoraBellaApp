/**
 * Los avisos de las apps que se pagan todos los meses.
 *
 * Fabricio lo pidió así: "importante tener presente las fechas (…) no sé si
 * puede crear una alerta o recordatorio en la plataforma, que salga". Hasta
 * ahora las fechas de cobro vivían en la cabeza de alguien, y una app que se
 * corta por falta de pago se nota cuando ya se cortó.
 */

/** El día del mes en que cae un cobro, para un mes concreto. */
export function diaDeCobro(anio: number, mes: number, diaDelMes: number) {
  // EL 31 EN UN MES DE 30 NO EXISTE, Y NO AVISAR ES LO PEOR QUE PUEDE PASAR.
  //
  // Una suscripción que cobra el 31 cobra el 30 en abril y el 28 en febrero.
  // Si se buscara el día exacto, esos meses no dispararían ningún aviso —y
  // justamente el cobro sí ocurre—. Se recorta al último día del mes.
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return Math.min(diaDelMes, ultimo);
}

export type PagoParaAvisar = {
  id: string;
  nombre: string;
  monto: number | null;
  moneda: string;
  diaDelMes: number;
  avisarDiasAntes: number;
  activo: boolean;
  avisoPrevioEn: string | null;
  avisoDiaEn: string | null;
};

export type AvisoDePago = {
  pago: PagoParaAvisar;
  /** "previo" faltando días; "dia" el mismo día del cobro. */
  tipo: "previo" | "dia";
  /** El día del mes en que cae el cobro este mes. */
  diaEfectivo: number;
  /** Cuántos días faltan. 0 el mismo día. */
  faltan: number;
  /** El período avisado, "2026-10". */
  periodo: string;
};

const periodoDe = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;

/**
 * Qué hay que avisar hoy.
 *
 * `hoy` llega como el día de Ecuador para que la decisión no dependa del huso
 * del servidor: un cobro del día 5 avisado con la fecha UTC saldría el 4 por la
 * noche para quien lo lee en Guayaquil.
 *
 * Cada pago avisa DOS VECES como mucho por mes —unos días antes y el mismo
 * día—, y cada aviso se marca con su período. Sin esa marca saldría en cada
 * vuelta del reloj, decenas por día, y en una semana nadie los miraría.
 */
export function avisosDeHoy(pagos: PagoParaAvisar[], hoy: Date): AvisoDePago[] {
  const anio = hoy.getUTCFullYear();
  const mes = hoy.getUTCMonth() + 1;
  const dia = hoy.getUTCDate();
  const periodo = periodoDe(anio, mes);

  const avisos: AvisoDePago[] = [];

  for (const pago of pagos) {
    if (!pago.activo) continue;
    const diaEfectivo = diaDeCobro(anio, mes, pago.diaDelMes);
    const faltan = diaEfectivo - dia;

    if (faltan === 0) {
      if (pago.avisoDiaEn !== periodo) {
        avisos.push({ pago, tipo: "dia", diaEfectivo, faltan: 0, periodo });
      }
      continue;
    }

    // El aviso previo sale una vez, en la ventana que va desde los días
    // configurados hasta el día anterior. Si el reloj no corrió el día exacto
    // —un despliegue, un corte—, el aviso igual sale al día siguiente en vez de
    // perderse, que es lo que importa.
    if (faltan > 0 && faltan <= pago.avisarDiasAntes) {
      if (pago.avisoPrevioEn !== periodo) {
        avisos.push({ pago, tipo: "previo", diaEfectivo, faltan, periodo });
      }
    }
  }

  return avisos;
}

/** El texto del aviso, el mismo para la campanita, el push y el correo. */
export function textoDelAviso(a: AvisoDePago) {
  const plata =
    a.pago.monto != null
      ? ` (${a.pago.monto.toLocaleString("es-EC", {
          style: "currency",
          currency: a.pago.moneda || "USD",
          maximumFractionDigits: 2,
        })})`
      : "";

  if (a.tipo === "dia") return `Hoy se cobra ${a.pago.nombre}${plata}.`;
  if (a.faltan === 1) return `Mañana se cobra ${a.pago.nombre}${plata}.`;
  return `En ${a.faltan} días se cobra ${a.pago.nombre}${plata} (el ${a.diaEfectivo}).`;
}
