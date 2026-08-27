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

  return NextResponse.json(
    { ok: true, database: "ok", uptimeSeconds, checkedAt },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
