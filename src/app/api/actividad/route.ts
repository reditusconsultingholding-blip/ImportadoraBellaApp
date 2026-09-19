import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contextoDelPedido, registrarActividad } from "@/lib/actividad";
import { leerCuerpo } from "@/lib/validacion";
import { frenarUsuario } from "@/lib/limite";
import { jsonComprimido } from "@/lib/respuesta";

// POST: el navegador avisa lo que alguien escribió en un buscador (es lo único
// del seguimiento que no pasa por el servidor por sí solo).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const frenado = frenarUsuario("actividad-busqueda", session.userId, 120, 10 * 60 * 1000);
  if (frenado) return frenado;

  const lectura = await leerCuerpo(
    req,
    z.object({
      termino: z.string().trim().min(2).max(200),
      // Solo pantallas del panel: no se aceptan rutas arbitrarias.
      ruta: z.string().max(500).regex(/^\/dashboard(\/|\?|$)/),
    }),
  );
  if (!lectura.ok) return lectura.respuesta;

  registrarActividad({
    organizationId: session.organizationId,
    userId: session.userId,
    tipo: "busqueda",
    ruta: lectura.datos.ruta,
    detalle: lectura.datos.termino,
    ...(await contextoDelPedido()),
  });
  return NextResponse.json({ ok: true });
}

// GET: el seguimiento de una persona. Solo el administrador (OWNER), y solo de
// gente de su organización.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Solo el administrador ve el seguimiento." }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const usuarioId = q.get("usuario") ?? "";
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  const desde = q.get("desde") ?? "";
  const hasta = q.get("hasta") ?? "";
  const tipo = q.get("tipo");
  if (!usuarioId || !dia.test(desde) || !dia.test(hasta)) {
    return NextResponse.json({ error: "Faltan la persona o las fechas." }, { status: 400 });
  }

  const persona = await db.user.findFirst({
    where: { id: usuarioId, organizationId: session.organizationId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!persona) return NextResponse.json({ error: "Esa persona no existe." }, { status: 404 });

  // Días de Ecuador (UTC−5): del 00:00 del primero al 23:59 del último.
  const inicio = new Date(`${desde}T05:00:00.000Z`);
  const fin = new Date(new Date(`${hasta}T05:00:00.000Z`).getTime() + 86400_000);

  const [eventos, preguntas] = await Promise.all([
    db.actividadUsuario.findMany({
      where: {
        organizationId: session.organizationId,
        userId: persona.id,
        momento: { gte: inicio, lt: fin },
        ...(tipo ? { tipo } : {}),
      },
      orderBy: { momento: "desc" },
      take: 3000,
      select: { id: true, momento: true, tipo: true, ruta: true, detalle: true, ip: true, navegador: true },
    }),
    // Lo que le preguntó a Jarvis ya está guardado en sus conversaciones.
    !tipo || tipo === "jarvis"
      ? db.jarvisMensaje.findMany({
          where: {
            rol: "user",
            createdAt: { gte: inicio, lt: fin },
            conversacion: { userId: persona.id, organizationId: session.organizationId },
          },
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { id: true, createdAt: true, contenido: true },
        })
      : Promise.resolve([]),
  ]);

  return jsonComprimido({
    persona,
    eventos: [
      ...eventos.map((e) => ({ ...e, momento: e.momento.toISOString() })),
      ...preguntas.map((p) => ({
        id: p.id,
        momento: p.createdAt.toISOString(),
        tipo: "jarvis",
        ruta: "/dashboard/jarvis",
        detalle: p.contenido.slice(0, 500),
        ip: null,
        navegador: null,
      })),
    ].sort((a, b) => (a.momento < b.momento ? 1 : -1)),
    truncado: eventos.length === 3000,
  });
}
