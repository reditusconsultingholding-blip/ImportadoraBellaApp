import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import { veLasCifras } from "@/lib/finanzas";
import { textoComprimido } from "@/lib/respuesta";
import { NOMBRE_CAJA, origenPorVenta } from "@/lib/origen-pedidos";
import { registrarActividad } from "@/lib/actividad";

// Todas las ventas del período con la caja de cada una, para abrir en Excel.
//
// Es la prueba del reporte de origen: quien dude de un número filtra la
// columna "Caja" y cuenta. No lleva datos del comprador (ni nombre ni
// teléfono), solo el número de la orden para buscarla en Shopify. El valor de
// la venta va solo para quien ve las cifras.

function celda(v: string | number | null) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const verCifras = await veLasCifras(session.userId);

  const p = req.nextUrl.searchParams;
  const range = resolveRange(p.get("rango") ?? "ayer", p.get("desde") ?? undefined, p.get("hasta") ?? undefined);
  const r = await origenPorVenta(session.organizationId, range);

  const encabezados = [
    "Dia",
    "Hora (Ecuador)",
    "Numero de orden Shopify",
    "Producto",
    "Caja",
    "Entro por",
    "Ya habia comprado antes",
    ...(verCifras ? ["Valor"] : []),
  ];
  const filas = r.ventas.map((v) =>
    [
      v.dia,
      v.hora,
      v.shopifyId,
      celda(v.producto),
      celda(NOMBRE_CAJA[v.caja]),
      celda(v.canal),
      v.recurrente ? "Si" : "No",
      ...(verCifras ? [v.facturado.toFixed(2)] : []),
    ].join(","),
  );

  registrarActividad({
    organizationId: session.organizationId,
    userId: session.userId,
    tipo: "descarga",
    detalle: `Origen de las ventas · ${range.label} · ${r.total} ventas`,
    ruta: "/dashboard/origen",
  });

  // El BOM hace que Excel abra el archivo en UTF-8 (tildes y eñes bien).
  const csv = "﻿" + [encabezados.join(","), ...filas].join("\n");
  const desde = range.from.toISOString().slice(0, 10);
  const hasta = range.to.toISOString().slice(0, 10);
  return textoComprimido(csv, "text/csv; charset=utf-8", {
    headers: {
      "Content-Disposition": `attachment; filename="origen-ventas-${desde}_a_${hasta}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
