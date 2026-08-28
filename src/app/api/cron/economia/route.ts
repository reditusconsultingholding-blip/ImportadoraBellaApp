import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cronAuthorized } from "@/lib/cron-auth";
import { calcular, economiaDe } from "@/lib/economia";

// Carga la economía real de los productos desde la planilla del equipo.
//
// La hoja VARIABLES trae, por producto y por mes: precio promedio, costo de
// producción, flete, porcentaje de efectividad y porcentaje de devoluciones. Y
// su columna ID es el MISMO código numérico que el equipo pone en el nombre de
// cada campaña, así que engancha directo con lo que ya está en la base.
//
// Con eso el CPA objetivo deja de ser una estimación y pasa a ser el número del
// negocio. La diferencia no es cosmética: un producto con 100% de margen bruto
// y 20% de efectividad pierde plata en cada venta, y el objetivo estimado lo
// mostraba en verde.

type Entrada = {
  code?: string;
  nombre?: string;
  mes?: string;
  precio?: number;
  produccion?: number;
  flete?: number;
  efectividad?: number;
  devoluciones?: number;
};

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await req.json()) as { productos?: Entrada[]; gastoAdmPorPedido?: number };
  const entradas = cuerpo.productos ?? [];
  if (entradas.length === 0) {
    return NextResponse.json({ error: "No vino ningún producto." }, { status: 400 });
  }

  const orgs = await db.organization.findMany({ select: { id: true } });
  const resultados: unknown[] = [];

  for (const org of orgs) {
    const productos = await db.product.findMany({
      where: { organizationId: org.id },
      select: { id: true, code: true, name: true },
    });
    const porCodigo = new Map(productos.map((p) => [p.code, p]));

    let actualizados = 0;
    const sinFicha: string[] = [];

    for (const e of entradas) {
      const code = String(e.code ?? "").trim();
      if (!code) continue;

      const ficha = porCodigo.get(code);
      if (!ficha) {
        // Un producto de la planilla que nunca se pauteó no tiene ficha. No es
        // un error: se anota para poder decir cuántos quedaron afuera.
        sinFicha.push(`${code} ${e.nombre ?? ""}`.trim());
        continue;
      }

      const economia = economiaDe({
        salePrice: e.precio ?? null,
        unitCost: e.produccion ?? null,
        efectividad: e.efectividad ?? null,
        devoluciones: e.devoluciones ?? null,
        flete: e.flete ?? null,
        gastoAdmPorPedido: cuerpo.gastoAdmPorPedido ?? null,
      });
      if (!economia) continue;

      const cuentas = calcular(economia, null);
      // Un objetivo negativo o cero significa que el producto no cierra ni sin
      // gastar un peso en pauta. Se guarda igual —es información— pero se deja
      // en un mínimo simbólico para que el semáforo no divida por cero.
      const objetivo = Math.max(0.01, Math.round(cuentas.cpaObjetivo * 100) / 100);

      await db.product.update({
        where: { id: ficha.id },
        data: {
          salePrice: economia.precio,
          unitCost: economia.costo,
          flete: economia.flete,
          efectividad: economia.efectividad,
          devoluciones: economia.devoluciones,
          gastoAdmPorPedido: cuerpo.gastoAdmPorPedido ?? null,
          cpaTarget: objetivo,
          economiaDe: `Planilla del equipo${e.mes ? `, mes de ${e.mes.toLowerCase()}` : ""}`,
          notes: `Economía real cargada desde la planilla${e.mes ? ` (${e.mes.toLowerCase()})` : ""}. Punto de equilibrio ${cuentas.cpaBreakeven.toFixed(2)}; objetivo ${objetivo.toFixed(2)} con 30% de colchón. Entrega ${(cuentas.entregados * 100).toFixed(0)} de cada 100 checkouts.`,
        },
      });
      actualizados += 1;
    }

    resultados.push({ organizacion: org.id, actualizados, sinFicha: sinFicha.length, ejemplos: sinFicha.slice(0, 8) });
  }

  return NextResponse.json({ ok: true, recibidos: entradas.length, resultados });
}
