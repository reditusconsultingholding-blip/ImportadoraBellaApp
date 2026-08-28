import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { sincronizarTodo } from "@/lib/scheduler";

// Respaldo externo del reloj interno.
//
// El trabajo de verdad lo hace el reloj que vive adentro del servicio web (ver
// src/lib/scheduler.ts). Esta ruta existe para poder dispararlo desde afuera
// —un cron de Railway, un monitor, o a mano— y llama exactamente al mismo
// código: dos caminos distintos terminarían divergiendo, y el que no se usa
// todos los días es el que se rompe sin que nadie lo note.
//
// Las dos vías comparten el candado por fuente, así que dispararlas juntas no
// duplica nada.

export const maxDuration = 800;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const resumen = await sincronizarTodo();
    return NextResponse.json({ ok: true, ...resumen });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
