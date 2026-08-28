import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Endpoint de salud, pensado para un monitor externo (UptimeRobot, Better
// Stack, el health check de Railway, etc.). Es público a propósito: un
// monitor no puede iniciar sesión. No devuelve nada sensible — solo si la
// app responde y si la base contesta.
//
//   200 → todo bien
//   503 → la app levanta pero la base no responde: el monitor avisa y, según
//         dónde corra, la plataforma la reinicia sola.
//
// Si la app está caída del todo, la petición ni siquiera llega acá y el
// monitor lo ve como timeout — que es exactamente lo que se quiere detectar.

export const dynamic = "force-dynamic";

const startedAt = Date.now();

export async function GET() {
  const checkedAt = new Date().toISOString();
  const uptimeSeconds = Math.round((Date.now() - startedAt) / 1000);

  try {
    // Consulta mínima: confirma que la conexión a la base sigue viva.
    await db.$queryRaw`SELECT 1`;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        database: "error",
        detail: err instanceof Error ? err.message : String(err),
        uptimeSeconds,
        checkedAt,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  // "La app responde" y "los datos están frescos" son dos cosas distintas, y
  // confundirlas ya costó caro: el 27 de agosto la app estuvo arriba veinte
  // horas con la sincronización muerta, y el panel mostraba cero ventas como
  // si fuera un mal día.
  let sincronizacion: { fuente: string; haceMinutos: number | null; error: string | null }[] = [];
  let datosFrescos = true;
  try {
    const estados = await db.syncState.findMany({
      select: { fuente: true, okAt: true, error: true },
    });
    sincronizacion = estados.map((e) => ({
      fuente: e.fuente,
      haceMinutos: e.okAt ? Math.round((Date.now() - e.okAt.getTime()) / 60000) : null,
      error: e.error,
    }));
    // El reloj corre cada 5 minutos; 30 sin una corrida buena ya es un
    // problema, no una demora.
    datosFrescos =
      sincronizacion.length > 0 &&
      sincronizacion.every((s) => s.haceMinutos != null && s.haceMinutos <= 30);
  } catch {
    // Que no se pueda leer el estado no invalida el resto del chequeo.
  }

  return NextResponse.json(
    // "build" identifica qué versión está sirviendo. Sin esto no había forma
    // de saber si una respuesta venía del despliegue nuevo o del anterior
    // reiniciado, y se termina probando contra código viejo sin darse cuenta.
    {
      ok: true,
      build: process.env.APP_BUILD ?? "sin-marcar",
      database: "ok",
      datosFrescos,
      sincronizacion,
      uptimeSeconds,
      checkedAt,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
