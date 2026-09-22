import { db } from "@/lib/db";

// ¿El control muestra lo mismo que la planilla del equipo?
//
// POR QUÉ HACE FALTA PREGUNTARLO
// El control no lee la planilla al dibujarse: lee los cierres que se
// escribieron antes (`CortePublicitario` y `CorteSinAsignar`). Entre las dos
// cosas hay un paso —rehacer los cierres— y todo lo que tiene un paso en el
// medio puede quedarse a medias: se trajo la planilla pero se rehicieron solo
// unos días, o alguien enlazó un nombre y el recálculo no llegó a correr.
//
// Cuando eso pasa, la pantalla no avisa: muestra un número viejo con la misma
// cara que uno nuevo. Emilia lo encontró comparando a mano —su planilla decía
// 271 pedidos del día y el control 264— y esa es exactamente la clase de cosa
// que la herramienta tiene que encontrar sola.
//
// Así que una vez por hora se comparan los dos totales día por día, y si no
// dan, se rehacen los cierres desde el día más viejo que falla.

export type Descuadre = {
  /** Días de la planilla que no coinciden con el cierre guardado. */
  dias: number;
  /** Cuántos pedidos de diferencia hay en total. */
  pedidos: number;
  /** El día más viejo que falla, para saber desde dónde rehacer. */
  desde: Date | null;
};

/**
 * Compara los pedidos de la planilla contra los que tiene escrito el control.
 *
 * Solo mira los días que la planilla cubre: los demás salen de Shopify a
 * propósito y no tienen contra qué compararse.
 */
export async function descuadreDelControl(organizationId: string): Promise<Descuadre> {
  // El día en curso NO entra en la comparación.
  //
  // El cierre de un día se escribe a las 23:00 y `rellenarCierres` nunca toca
  // el día que todavía no terminó —un "cierre" de un día abierto sería mentira—.
  // Si se comparara, hoy siempre daría distinto: la planilla ya tiene los
  // pedidos de la mañana y el cierre todavía no existe. El resultado sería un
  // descuadre permanente que además no se puede arreglar, o sea ruido que
  // enseña a ignorar el aviso.
  const hoy = new Date(Date.now() - 5 * 3600_000);
  const desdeCuando = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()),
  );

  const filas = await db.$queryRaw<{ fecha: Date; planilla: number; control: number }[]>`
    WITH planilla AS (
      SELECT fecha, sum(pedidos)::int AS pedidos
        FROM "PedidoReporte"
       WHERE "organizationId" = ${organizationId}
         AND fecha < ${desdeCuando}
       GROUP BY fecha
    ),
    control AS (
      SELECT fecha, sum(p)::int AS pedidos FROM (
        SELECT fecha, "pedidosReales" AS p FROM "CortePublicitario"
         WHERE "organizationId" = ${organizationId} AND hora = 23
        UNION ALL
        SELECT fecha, "pedidosReales" AS p FROM "CorteSinAsignar"
         WHERE "organizationId" = ${organizationId} AND hora = 23
      ) t GROUP BY fecha
    )
    SELECT p.fecha,
           p.pedidos               AS planilla,
           coalesce(c.pedidos, 0)  AS control
      FROM planilla p
      LEFT JOIN control c ON c.fecha = p.fecha
     WHERE p.pedidos IS DISTINCT FROM coalesce(c.pedidos, 0)
     ORDER BY p.fecha`;

  if (filas.length === 0) return { dias: 0, pedidos: 0, desde: null };

  return {
    dias: filas.length,
    pedidos: filas.reduce((a, f) => a + Math.abs(Number(f.planilla) - Number(f.control)), 0),
    desde: filas[0].fecha,
  };
}
