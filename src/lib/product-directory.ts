import { db } from "@/lib/db";
import { getPulses, type PulseState } from "@/lib/pulse";
import { sugerirAcciones } from "@/lib/product-actions";
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
  salePrice: number | null;
  unitCost: number | null;
  /** Margen bruto por unidad, cuando se conocen precio y costo. */
  margen: number | null;
  cpaTarget: number;
  cpaTargetProvisional: boolean;

  spend: number;
  purchases: number;
  cpa: number | null;
  score: number;
  state: PulseState;
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
};

export async function getDirectory(
  organizationId: string,
  range: Range
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

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      folder: p.folder?.name ?? null,
      salePrice: p.salePrice,
      unitCost: p.unitCost,
      margen,
      cpaTarget: p.cpaTarget,
      // La ficha dice si el objetivo se puso sin conocer la economía real.
      // Marcarlo importa: un semáforo verde contra un umbral inventado no
      // significa nada.
      cpaTargetProvisional: Boolean(p.notes?.includes("provisional")),

      spend: pulso?.spend ?? 0,
      purchases: pulso?.purchases ?? 0,
      cpa: pulso?.cpa ?? null,
      score: pulso?.score ?? 0,
      state: pulso?.state ?? "SIN_DATOS",
      serie: pulso?.serie ?? [],
      motivos: pulso?.motivos ?? [],
      sugerencias: pulso ? sugerirAcciones(pulso) : [],

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
    // no sobrevive ese viaje sin convertirse en string igual.
    pendientes: pendientes.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    equipo,
    totales: {
      productos: rows.length,
      conPauta: rows.filter((r) => r.spend > 0).length,
      sinCosto: rows.filter((r) => r.unitCost == null).length,
    },
  };
}
