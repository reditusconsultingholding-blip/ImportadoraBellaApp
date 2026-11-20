import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { separarClave } from "@/lib/clave-calculadora";
import { normalizar } from "@/lib/product-code";

/** Un número tecleado en la Calculadora ("5,61" o 5.61), o null. */
function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const limpio = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// Los ajustes de la calculadora se guardan por producto y los ve todo el
// equipo. Es la diferencia entre una calculadora y una planilla: si cada
// persona carga su propio flete y su propia tasa de confirmación, dos personas
// discuten sobre el mismo producto con números distintos y ninguna se entera.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // La calculadora es precio, costo, flete y margen de punta a punta.
  // Cerrar la pantalla sin cerrar su API dejaría los mismos números a un
  // fetch de distancia.
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const filas = await db.calcSetting.findMany({
    where: { organizationId: session.organizationId },
    select: { producto: true, data: true, updatedAt: true },
  });

  // Una fila con JSON roto no debe tirar abajo toda la calculadora: se saltea.
  const ajustes: Record<string, unknown> = {};
  for (const f of filas) {
    try {
      ajustes[f.producto] = JSON.parse(f.data);
    } catch {
      continue;
    }
  }

  return NextResponse.json({ ajustes });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // La calculadora es precio, costo, flete y margen de punta a punta.
  // Cerrar la pantalla sin cerrar su API dejaría los mismos números a un
  // fetch de distancia.
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { producto, data, parche } = (await req.json()) as {
    producto?: string;
    data?: unknown;
    /**
     * Mezclar con lo que ya había en vez de reemplazarlo.
     *
     * La calculadora manda todos sus valores juntos y puede reemplazar. Pero
     * la recomendación de un producto se escribe desde otra pantalla y solo
     * conoce ese campo: sin mezclar, guardarla borraría el costo, el flete y
     * la confirmación que alguien cargó antes.
     */
    parche?: boolean;
  };
  const nombre = producto?.trim();
  if (!nombre) {
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });
  }
  if (data == null || typeof data !== "object") {
    return NextResponse.json({ error: "Faltan los valores." }, { status: 400 });
  }

  let aGuardar = data as Record<string, unknown>;
  if (parche) {
    const previo = await db.calcSetting.findUnique({
      where: {
        organizationId_producto: { organizationId: session.organizationId, producto: nombre },
      },
      select: { data: true },
    });
    let base: Record<string, unknown> = {};
    if (previo) {
      try {
        const leido = JSON.parse(previo.data);
        if (leido && typeof leido === "object") base = leido as Record<string, unknown>;
      } catch {
        // JSON roto: se empieza de cero en vez de fallar. Perder un ajuste
        // ilegible es mejor que dejar la pantalla sin poder guardar nada.
      }
    }
    aGuardar = { ...base, ...aGuardar };
  }

  const json = JSON.stringify(aGuardar);
  // Tope de tamaño: esto guarda un puñado de números, no un documento. Sin
  // límite, un bug en la pantalla podría escribir megabytes por producto.
  if (json.length > 4000) {
    return NextResponse.json({ error: "Esos valores no entran." }, { status: 413 });
  }

  await db.calcSetting.upsert({
    where: {
      organizationId_producto: { organizationId: session.organizationId, producto: nombre },
    },
    create: {
      organizationId: session.organizationId,
      producto: nombre,
      data: json,
      updatedById: session.userId,
    },
    update: { data: json, updatedById: session.userId },
  });

  // Un ajuste de UN MES («BODY @ 2026-11») también va a Economía por producto
  // de ese mes, para que las dos pantallas muestren lo mismo (Emilia, 20-nov:
  // «tanto en control publicitario como en calculadora»).
  const { producto: nombreProducto, mes } = separarClave(nombre);
  if (mes) {
    const ficha = (
      await db.product.findMany({ where: { organizationId: session.organizationId }, select: { id: true, name: true } })
    ).find((p) => normalizar(p.name) === normalizar(nombreProducto));
    const precio = numero(aGuardar.priceOverride);
    const costo = numero(aGuardar.productCost);
    if (ficha && precio != null && costo != null) {
      const [anio, m] = mes.split("-").map(Number);
      const conf = numero(aGuardar.confirmationPct);
      const dev = numero(aGuardar.returnPct);
      const datos = {
        efectividad: conf == null ? 0 : conf / 100,
        produccion: costo,
        flete: numero(aGuardar.shippingCost) ?? 0,
        precioProm: precio,
        devoluciones: dev == null ? null : dev / 100,
      };
      await db.variableProducto.upsert({
        where: {
          organizationId_productId_anio_mes: { organizationId: session.organizationId, productId: ficha.id, anio, mes: m },
        },
        create: { organizationId: session.organizationId, productId: ficha.id, anio, mes: m, cpaMin: null, ...datos },
        update: datos,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
