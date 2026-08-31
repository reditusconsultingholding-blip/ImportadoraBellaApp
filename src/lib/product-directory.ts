import { db } from "@/lib/db";
import { getPulses, type PulseState } from "@/lib/pulse";
import { sugerirAcciones } from "@/lib/product-actions";
import { textoSinCifras } from "@/lib/finanzas";
import type { Range } from "@/lib/date-range";

// El directorio de productos: una fila por producto con todo lo que hace falta
// para decidir, sin abrir nada.
//
// Reemplaza al tablero libre. Un tablero sirve para pensar diez ideas; para
// mirar cincuenta productos y encontrar el que se está yendo de precio, hace
// falta una lista que se pueda buscar y ordenar.

export type DirectoryRow = {
  id: string;
  code: string;
  name: string;
  folder: string | null;
  /**
   * Precio, costo, margen, objetivo, gasto y CPA solo llegan cuando quien mira
   * tiene el permiso de finanzas. No están puestos en `null`: directamente no
   * existen en el objeto, porque esta fila se serializa dentro del HTML de la
   * página y un null igual habría dicho "acá hay un dato que no te muestro".
   */
  salePrice?: number | null;
  unitCost?: number | null;
  /** Margen bruto por unidad, cuando se conocen precio y costo. */
  margen?: number | null;
  cpaTarget?: number;
  cpaTargetProvisional: boolean;

  spend?: number;
  /** Si tuvo pauta en el período: dice si está corriendo, no cuánto costó. */
  conPauta: boolean;
  purchases: number;
  cpa?: number | null;
  score: number;
  state: PulseState;
  /** En dólares por día para la dirección; en escala relativa para el resto. */
  serie: number[];
  motivos: string[];
  sugerencias: { kind: string; detail: string; reason: string }[];

  campanas: number;
  creativos: number;
  creativosEnProduccion: number;
  creativosListosHoy: number;
  creativosVencidos: number;
};

export type Directory = {
  rows: DirectoryRow[];
  carpetas: string[];
  pendientes: {
    id: string;
    kind: string;
    detail: string;
    cantidad: number | null;
    reason: string;
    createdAt: string;
    product: { id: string; code: string; name: string };
    proposedBy: { id: string; name: string };
  }[];
  equipo: { id: string; name: string; role: string }[];
  /** Cuántos productos de la tienda todavía no se siguen. */
  totales: { productos: number; conPauta: number; sinCosto: number };
  /** Se arrastra hasta la pantalla para que sepa qué columnas puede dibujar. */
  verCifras: boolean;
};

/**
 * @param verCifras si quien va a mirar tiene el permiso de finanzas. Se filtra
 * ACÁ y no en la pantalla: el directorio es un componente de servidor y sus
 * filas viajan enteras al navegador dentro del HTML.
 */
export async function getDirectory(
  organizationId: string,
  range: Range,
  verCifras: boolean
): Promise<Directory> {
  // "Hoy" es el de Ecuador, no el del servidor: Railway corre en UTC y
  // setHours() haría que el día arrancara a las 19:00 de la víspera.
  const ahora = new Date();
  const enEcuador = new Date(ahora.getTime() - 5 * 3600_000);
  const hoy = new Date(
    Date.UTC(enEcuador.getUTCFullYear(), enEcuador.getUTCMonth(), enEcuador.getUTCDate()) +
      5 * 3600_000
  );

  const [productos, pulsos, creativos, pendientes, equipo] = await Promise.all([
    db.product.findMany({
      where: { organizationId, archived: false },
      select: {
        id: true,
        code: true,
        name: true,
        salePrice: true,
        unitCost: true,
        cpaTarget: true,
        notes: true,
        folder: { select: { name: true } },
        _count: { select: { campaigns: true } },
      },
      orderBy: { name: "asc" },
    }),
    getPulses(organizationId, range),
    db.requirement.findMany({
      // Sin el historico: son piezas archivadas de otra operacion y contarlas
      // como trabajo en curso daria numeros que no significan nada.
      where: { organizationId, productId: { not: null }, origen: null },
      select: {
        productId: true,
        status: true,
        dueDate: true,
        updatedAt: true,
      },
    }),
    // Lo que espera decisión, para que la misma cola aparezca aquí y en el
    // panel. Si viviera en un solo lugar, la mitad del equipo no la vería.
    db.productAction.findMany({
      where: { organizationId, status: "PROPUESTA" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        detail: true,
        cantidad: true,
        reason: true,
        createdAt: true,
        product: { select: { id: true, code: true, name: true } },
        proposedBy: { select: { id: true, name: true } },
      },
    }),
    db.user.findMany({
      where: { organizationId, role: { in: ["OWNER", "DIRECTOR", "EDITOR"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  const pulsoPorProducto = new Map(pulsos.map((p) => [p.productId, p]));

  // Los creativos se cuentan una sola vez y se reparten, en vez de hacer una
  // consulta por producto.
  type Conteo = { total: number; produccion: number; listosHoy: number; vencidos: number };
  const conteos = new Map<string, Conteo>();
  const TERMINADO = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);

  for (const c of creativos) {
    if (!c.productId) continue;
    const acc = conteos.get(c.productId) ?? {
      total: 0,
      produccion: 0,
      listosHoy: 0,
      vencidos: 0,
    };
    acc.total += 1;
    const terminado = TERMINADO.has(c.status);
    if (!terminado) {
      acc.produccion += 1;
      // Vencido: tenía fecha de entrega, ya pasó, y sigue sin terminarse.
      if (c.dueDate && c.dueDate < hoy) acc.vencidos += 1;
    } else if (c.updatedAt >= hoy) {
      acc.listosHoy += 1;
    }
    conteos.set(c.productId, acc);
  }

  const rows: DirectoryRow[] = productos.map((p) => {
    const pulso = pulsoPorProducto.get(p.id);
    const conteo = conteos.get(p.id);
    const margen =
      p.salePrice != null && p.unitCost != null ? p.salePrice - p.unitCost : null;

    // El trazo se dibuja igual con la serie dividida por su pico —PulseLine
    // normaliza contra el máximo de lo que recibe—, pero así los dólares de
    // cada día no viajan al navegador.
    const serie = pulso?.serie ?? [];
    const pico = Math.max(0, ...serie);

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      folder: p.folder?.name ?? null,
      ...(verCifras
        ? {
            salePrice: p.salePrice,
            unitCost: p.unitCost,
            margen,
            cpaTarget: p.cpaTarget,
            spend: pulso?.spend ?? 0,
            cpa: pulso?.cpa ?? null,
          }
        : {}),
      // La ficha dice si el objetivo se puso sin conocer la economía real.
      // Marcarlo importa: un semáforo verde contra un umbral inventado no
      // significa nada.
      cpaTargetProvisional: Boolean(p.notes?.includes("provisional")),

      conPauta: (pulso?.spend ?? 0) > 0,
      purchases: pulso?.purchases ?? 0,
      score: pulso?.score ?? 0,
      state: pulso?.state ?? "SIN_DATOS",
      serie: verCifras || pico <= 0 ? serie : serie.map((v) => Number((v / pico).toFixed(4))),
      motivos: (verCifras ? pulso?.motivos : pulso?.motivosSinCifras) ?? [],
      sugerencias: pulso ? sugerirAcciones(pulso, verCifras) : [],

      campanas: p._count.campaigns,
      creativos: conteo?.total ?? 0,
      creativosEnProduccion: conteo?.produccion ?? 0,
      creativosListosHoy: conteo?.listosHoy ?? 0,
      creativosVencidos: conteo?.vencidos ?? 0,
    };
  });

  const carpetas = [...new Set(rows.map((r) => r.folder).filter(Boolean) as string[])].sort(
    (a, b) => a.localeCompare(b, "es")
  );

  return {
    rows,
    carpetas,
    // Las fechas viajan como texto: cruzan del servidor al navegador y un Date
    // no sobrevive ese viaje sin convertirse en string igual. El motivo va
    // por el mismo filtro que el resto: lo escribió otra persona y puede
    // traer el CPA adentro.
    pendientes: pendientes.map((a) => ({
      ...a,
      reason: textoSinCifras(a.reason, verCifras) ?? a.reason,
      createdAt: a.createdAt.toISOString(),
    })),
    equipo,
    totales: {
      productos: rows.length,
      conPauta: rows.filter((r) => r.conPauta).length,
      // Cuántos productos no tienen cargado su costo. Es un aviso de carga
      // pendiente para la dirección, así que cuando no se ven cifras no se
      // cuenta ni se manda: la pantalla no tendría dónde ponerlo.
      sinCosto: verCifras ? productos.filter((p) => p.unitCost == null).length : 0,
    },
    verCifras,
  };
}
