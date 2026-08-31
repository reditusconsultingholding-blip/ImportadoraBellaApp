import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import {
  arranqueDeHoyEc,
  claveDiaEc,
  claveMes,
  horaEcDe,
  instanteDeDiaEc,
  limitesDelMesEc,
  parsearMes,
  type EventoVista,
} from "@/lib/calendario-fechas";

// El calendario de eventos de la empresa.
//
// Toda la aritmética de fechas se hace ACÁ y no en el navegador. El día y la
// hora que llegan del formulario son hora de pared de Ecuador ("2026-09-01",
// "14:30"); el servidor las convierte a instante con el desfase de Guayaquil y
// devuelve otra vez día y hora ya resueltos. Si la conversión la hiciera el
// navegador, el mismo evento se guardaría corrido para quien tuviera el equipo
// en otra zona, y un evento del 1 de septiembre aparecería el 31 de agosto.
//
// Ver es de cualquiera con acceso al chat; crear también, porque el calendario
// de la empresa sirve justamente para que quien organiza algo lo pueda poner.
// Borrar es de quien lo creó o de dirección.

/** Una fila de evento tal como la leen las consultas de esta ruta. */
type FilaEvento = {
  id: string;
  titulo: string;
  descripcion: string | null;
  lugar: string | null;
  inicio: Date;
  fin: Date | null;
  todoElDia: boolean;
  creadoPorId: string;
  creadoPor: { id: string; name: string };
};

const INCLUDE_EVENTO = { creadoPor: { select: { id: true, name: true } } };

/**
 * Cuántos eventos futuros se muestran sin entrar al mes.
 *
 * Cinco: es lo que cabe al lado del calendario sin empujar la rejilla fuera de
 * la pantalla, y "lo que viene" son los próximos días, no el trimestre.
 */
const PROXIMOS = 5;

/** Cuántos días hacia adelante se miran para armar esa lista. */
const VENTANA_PROXIMOS_DIAS = 60;

function aVista(e: FilaEvento, viewerId: string, esDireccion: boolean): EventoVista {
  return {
    id: e.id,
    titulo: e.titulo,
    descripcion: e.descripcion,
    lugar: e.lugar,
    dia: claveDiaEc(e.inicio),
    hora: e.todoElDia ? null : horaEcDe(e.inicio),
    diaFin: e.fin ? claveDiaEc(e.fin) : null,
    horaFin: e.fin && !e.todoElDia ? horaEcDe(e.fin) : null,
    todoElDia: e.todoElDia,
    creadoPor: e.creadoPor,
    puedeBorrar: esDireccion || e.creadoPorId === viewerId,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "No tienes acceso al calendario." }, { status: 403 });
  }

  const { anio, mes } = parsearMes(req.nextUrl.searchParams.get("mes"));
  const { desde, hasta } = limitesDelMesEc(anio, mes);
  const hoy = arranqueDeHoyEc();
  const esDireccion = canManagePipeline(session.role);

  const [delMes, proximos] = await Promise.all([
    db.eventoCalendario.findMany({
      where: {
        organizationId: session.organizationId,
        inicio: { gte: desde, lt: hasta },
      },
      orderBy: { inicio: "asc" },
      include: INCLUDE_EVENTO,
    }),
    // Lo que viene arranca en la medianoche de HOY en Ecuador, no en "ahora":
    // un evento de las 9 de la mañana tiene que seguir figurando a las 11,
    // porque el día todavía es ese.
    db.eventoCalendario.findMany({
      where: {
        organizationId: session.organizationId,
        inicio: {
          gte: hoy,
          lt: new Date(hoy.getTime() + VENTANA_PROXIMOS_DIAS * 86_400_000),
        },
      },
      orderBy: { inicio: "asc" },
      take: PROXIMOS,
      include: INCLUDE_EVENTO,
    }),
  ]);

  return NextResponse.json({
    mes: claveMes(anio, mes),
    eventos: delMes.map((e) => aVista(e, session.userId, esDireccion)),
    proximos: proximos.map((e) => aVista(e, session.userId, esDireccion)),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "No tienes acceso al calendario." }, { status: 403 });
  }

  const body = (await req.json()) as {
    titulo?: string;
    descripcion?: string;
    lugar?: string;
    dia?: string;
    hora?: string;
    diaFin?: string;
    horaFin?: string;
    todoElDia?: boolean;
  };

  const titulo = (body.titulo ?? "").trim();
  if (titulo.length < 3) {
    return NextResponse.json({ error: "Ponle un nombre al evento." }, { status: 400 });
  }
  if (titulo.length > 140) {
    return NextResponse.json({ error: "El nombre del evento es muy largo." }, { status: 400 });
  }

  const todoElDia = body.todoElDia !== false;
  const inicio = instanteDeDiaEc(body.dia ?? "", todoElDia ? null : body.hora);
  if (!inicio) {
    return NextResponse.json(
      { error: todoElDia ? "Elige la fecha del evento." : "Elige la fecha y la hora del evento." },
      { status: 400 }
    );
  }

  // El fin es opcional. Cuando viene sin día propio se entiende que termina el
  // mismo día en que empieza — que es como se escribe una reunión de 9 a 11.
  let fin: Date | null = null;
  const diaFin = body.diaFin?.trim() || body.dia;
  const horaFin = todoElDia ? null : body.horaFin?.trim();
  if (body.diaFin?.trim() || horaFin) {
    fin = instanteDeDiaEc(diaFin ?? "", horaFin);
    if (!fin) {
      return NextResponse.json({ error: "El final del evento no es una fecha válida." }, { status: 400 });
    }
    if (fin.getTime() < inicio.getTime()) {
      return NextResponse.json(
        { error: "El evento no puede terminar antes de empezar." },
        { status: 400 }
      );
    }
  }

  const creado = await db.eventoCalendario.create({
    data: {
      organizationId: session.organizationId,
      creadoPorId: session.userId,
      titulo,
      descripcion: body.descripcion?.trim() || null,
      lugar: body.lugar?.trim() || null,
      inicio,
      fin,
      todoElDia,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: creado.id });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "No tienes acceso al calendario." }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });

  // Quien no es dirección solo puede borrar lo suyo, y eso se resuelve METIENDO
  // su userId en el WHERE. Traer el evento y comparar después dejaría el
  // permiso dependiendo de que nadie borre esa línea más adelante.
  const borrados = await db.eventoCalendario.deleteMany({
    where: {
      id,
      organizationId: session.organizationId,
      ...(canManagePipeline(session.role) ? {} : { creadoPorId: session.userId }),
    },
  });
  if (borrados.count === 0) {
    return NextResponse.json(
      { error: "Ese evento no existe o no lo creaste tú." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
