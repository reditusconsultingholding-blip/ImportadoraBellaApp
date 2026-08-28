import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import { getPatronesClientes } from "@/lib/clientes";

// Descarga de la lista de clientes en CSV.
//
// Son datos personales de los compradores del cliente, así que queda del lado
// de dirección: un editor no tiene por qué poder bajarse la base de teléfonos.

/** Escapa un valor para CSV: comillas dobles y las comas de adentro. */
function celda(v: string | number | null) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const range = resolveRange(
    p.get("rango") ?? "12m",
    p.get("desde") ?? undefined,
    p.get("hasta") ?? undefined
  );

  // Sin tope: el CSV es justamente para tener la lista completa.
  const datos = await getPatronesClientes(session.organizationId, range, 1_000_000);

  const encabezados = [
    "Telefono",
    "Nombre",
    "Email",
    "Provincia",
    "Ciudad",
    "Pedidos",
    "Total",
    "Primera compra",
    "Ultima compra",
    "Productos",
  ];

  const filas = datos.clientes.map((c) =>
    [
      celda(c.telefono),
      celda(c.nombre),
      celda(c.email),
      celda(c.provincia),
      celda(c.ciudad),
      c.pedidos,
      c.total.toFixed(2),
      c.primera.toISOString().slice(0, 10),
      c.ultima.toISOString().slice(0, 10),
      celda(c.productos.join(" · ")),
    ].join(",")
  );

  // El BOM hace que Excel abra el archivo en UTF-8: sin él, los acentos y las
  // eñes salen rotos y hay que reimportar a mano.
  const csv = "﻿" + [encabezados.join(","), ...filas].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${range.id}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
