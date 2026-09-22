import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { minutosDeIntervalo } from "@/lib/integrations/windsor";

// Qué tan frescos están los datos de Meta y TikTok, para el contador del
// encabezado: cuándo llegó lo último nuevo, cada cuánto refresca Windsor y
// cuándo se espera lo próximo. Ver anotarFrescura en src/lib/scheduler.ts.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const estados = await db.syncState.findMany({
    where: {
      organizationId: session.organizationId,
      fuente: { in: ["frescura-facebook", "frescura-tiktok", "facebook", "tiktok", "shopify"] },
    },
    select: { fuente: true, okAt: true, detalle: true },
  });
  const de = (f: string) => estados.find((e) => e.fuente === f);

  const conectores = (["facebook", "tiktok"] as const).map((c) => {
    const frescura = de(`frescura-${c}`);
    const consulta = de(c);
    const intervaloMin = minutosDeIntervalo(frescura?.detalle === "6h" ? null : frescura?.detalle);
    const datosDe = frescura?.okAt ?? null;
    return {
      conector: c,
      nombre: c === "facebook" ? "Meta" : "TikTok",
      intervaloMin,
      /** Cuándo llegó el último dato nuevo. */
      datosDe: datosDe?.toISOString() ?? null,
      /** Cuándo se espera el próximo: el último nuevo más el intervalo. */
      proxima: datosDe ? new Date(datosDe.getTime() + intervaloMin * 60_000).toISOString() : null,
      /** La última vez que Jarvis le preguntó a Windsor. */
      consultado: consulta?.okAt?.toISOString() ?? null,
    };
  });

  // Las ventas son otra cosa: Shopify se lee entero cada 2 minutos, sin
  // caché de por medio, así que lo que importa es cuándo fue la última.
  const ventas = {
    nombre: "Ventas de Shopify",
    intervaloMin: 2,
    datosDe: de("shopify")?.okAt?.toISOString() ?? null,
    proxima: de("shopify")?.okAt ? new Date(de("shopify")!.okAt!.getTime() + 2 * 60_000).toISOString() : null,
  };

  return NextResponse.json({ conectores, ventas, ahora: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
