import { db } from "@/lib/db";
import type { Platform } from "@/generated/prisma/client";

/**
 * Qué plataforma de pauta dejó de cargar datos.
 *
 * Existe por lo que pasó el 4 de octubre. TikTok se cortó a las 7:10 de la
 * mañana y la app siguió mostrando sus números como si estuvieran completos.
 * Nadie se enteró hasta el día siguiente, cuando el dueño vio 111 ventas en la
 * tienda y el gasto de TikTok en cero.
 *
 * LO GRAVE NO FUE PERDER EL DATO. Fue que todo lo demás siguió calculándose
 * como si nada: el CPA general divide TODAS las ventas por el gasto de pauta, y
 * con el gasto de una plataforma faltando sale bastante más bajo que el real.
 * Durante día y medio el panel mostró un negocio más rentable de lo que era, y
 * se leía con la misma confianza que cualquier otro día. Un número optimista y
 * silencioso es peor que una pantalla en blanco: con la pantalla en blanco uno
 * pregunta.
 *
 * La señal es el error de sincronización y no la antigüedad del último dato.
 * Las instantáneas se guardan por día calendario, así que a las once de la
 * noche el último dato de una plataforma sana ya tiene veintitrés horas — medir
 * por horas obliga a elegir entre avisar de más o avisar tarde. El error, en
 * cambio, es exacto: la sincronización falla desde que el conector devuelve cero
 * filas teniendo cuentas conectadas (ver windsor-sync.ts).
 */

const CONECTOR: Record<string, { plataforma: Platform; etiqueta: string }> = {
  facebook: { plataforma: "META", etiqueta: "Meta" },
  tiktok: { plataforma: "TIKTOK", etiqueta: "TikTok" },
};

export type PlataformaCallada = {
  etiqueta: string;
  /** Desde cuándo está fallando. */
  desde: Date;
  /** El día del último dato que alcanzó a entrar, si entró alguno. */
  ultimoDia: string | null;
  /**
   * Lo que venía gastando por día antes de cortarse.
   *
   * Es lo que convierte un aviso técnico en uno de negocio: "TikTok no carga"
   * se puede postergar, "no estás viendo mil cien dólares por día" no.
   */
  gastoDiario: number | null;
};

export async function plataformasCalladas(organizationId: string): Promise<PlataformaCallada[]> {
  const estados = await db.syncState.findMany({
    where: { organizationId, fuente: { in: Object.keys(CONECTOR) } },
    select: { fuente: true, okAt: true, errorAt: true },
  });

  const caidas = estados.filter(
    (e) => e.errorAt != null && (e.okAt == null || e.errorAt > e.okAt)
  );
  if (caidas.length === 0) return [];

  const avisos: PlataformaCallada[] = [];

  for (const estado of caidas) {
    const { plataforma, etiqueta } = CONECTOR[estado.fuente];

    // Una plataforma sin cuentas conectadas no se avisa: el error puede ser de
    // una configuración a medio hacer, y un aviso rojo por algo que nunca
    // funcionó enseña a ignorar los avisos rojos.
    const cuentas = await db.adAccount.count({ where: { organizationId, platform: plataforma } });
    if (cuentas === 0) continue;

    const ultimo = await db.metricSnapshot.findFirst({
      where: { campaign: { adAccount: { organizationId, platform: plataforma } } },
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    });

    let gastoDiario: number | null = null;
    if (ultimo) {
      // Los siete días ANTERIORES al último, no los siete hasta hoy: el último
      // día suele estar cargado a medias —el 4 de octubre entraron 77 dólares
      // de los mil y pico que iban— y meterlo en el promedio lo hunde justo
      // cuando se lo quiere usar para dimensionar lo que falta.
      const hasta = new Date(ultimo.capturedAt);
      const desde = new Date(hasta);
      desde.setDate(desde.getDate() - 7);

      const previo = await db.metricSnapshot.aggregate({
        where: {
          campaign: { adAccount: { organizationId, platform: plataforma } },
          capturedAt: { gte: desde, lt: hasta },
        },
        _sum: { spend: true },
      });
      const total = previo._sum.spend ?? 0;
      if (total > 0) gastoDiario = total / 7;
    }

    avisos.push({
      etiqueta,
      desde: estado.errorAt!,
      ultimoDia: ultimo ? ultimo.capturedAt.toISOString().slice(0, 10) : null,
      gastoDiario,
    });
  }

  return avisos;
}
