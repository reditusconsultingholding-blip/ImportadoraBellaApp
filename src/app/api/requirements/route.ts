import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { creativosSinCifras, veLasCifras } from "@/lib/finanzas";
import { REQUIREMENT_STATUSES } from "@/lib/pipeline-options";
import { sincronizarTareaDeRequerimiento } from "@/lib/tarea-de-requerimiento";
import { formatoRepetido, piezasVisibles, puedeCrearEn } from "@/lib/responsables";
import { jsonComprimido } from "@/lib/respuesta";
import { memorizar } from "@/lib/memoria";
import { avisarAsignacion } from "@/lib/aviso-asignacion";

// Las 6.000+ piezas de la organización, compartidas en memoria hasta la
// próxima escritura (crear o editar una pieza la invalida). La clave lleva el
// filtro de visibilidad de quien pide, así que un editor sigue recibiendo solo
// lo suyo. Ver src/lib/memoria.ts.
const piezasDe = memorizar("api.requirements", async (organizationId: string, filtro: string) =>
  db.requirement.findMany({
    where: { organizationId, ...(JSON.parse(filtro) as object) },
    include: {
      product: { select: { code: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  }),
);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado en el pipeline." }, { status: 403 });
  }

  // El período común de Contenido. Una pieza entra si se ENTREGA en esas
  // fechas o, cuando no tiene fecha de entrega puesta, si se creó en ellas:
  // filtrar solo por la entrega escondería las piezas recién pedidas, que son
  // las que hay que empezar a trabajar.
  const dia = (v: string | null) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
  const desde = dia(req.nextUrl.searchParams.get("desde"));
  const hasta = dia(req.nextUrl.searchParams.get("hasta"));
  const enRango =
    desde && hasta
      ? (() => {
          const fin = new Date(hasta.getTime() + 24 * 3600_000 - 1);
          return {
            OR: [
              { dueDate: { gte: desde, lte: fin } },
              { AND: [{ dueDate: null }, { createdAt: { gte: desde, lte: fin } }] },
            ],
          };
        })()
      : {};

  // Dirección ve todo. Un editor, lo asignado a su nombre y todo lo de los
  // productos que tiene a cargo — ver src/lib/responsables.ts.
  const requirements = await piezasDe(
    session.organizationId,
    JSON.stringify({ ...(await piezasVisibles(session)), ...enRango }),
  );

  // El CPA y el CPM de cada pieza son plata: se cortan acá, no al dibujar.
  const verCifras = await veLasCifras(session.userId);
  return jsonComprimido({
    requirements: creativosSinCifras(requirements, verCifras),
    verCifras,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado en el pipeline." }, { status: 403 });
  }

  const body = await req.json();
  const {
    productId,
    adName,
    externalId1,
    externalId2,
    adType,
    phase,
    visualFormat,
    angle,
    awarenessLevel,
    marketOrigin,
    ownerId,
    status,
    dueDate,
    thumbnailUrl,
    ronda,
  } = body as Record<string, string | undefined>;

  // Dos maneras de crear una pieza.
  //
  // La completa —el formulario, con todos los campos— sigue igual y es de
  // dirección: sirve para testeos o para dejarle algo puntual a alguien.
  //
  // La rápida es la fila de abajo de cada producto: se escribe el nombre y la
  // pieza nace, y el resto se completa en la misma tabla. Es la que usan los
  // responsables para subir sus cinco piezas del día. Pedir los seis campos de
  // clasificación antes de dejarla existir era lo que hacía que cargar
  // cincuenta creativos fuera "una pérdida de tiempo"; ahora se clasifican
  // después, y las que queden sin clasificar salen en el aviso de las ocho.
  const rapida = body.rapida === true;

  if (!(await puedeCrearEn(session, productId || null))) {
    return NextResponse.json(
      {
        error: canManagePipeline(session.role)
          ? "Falta el producto."
          : "Solo los responsables de este producto pueden cargarle piezas.",
      },
      { status: 403 },
    );
  }

  if (!adName?.trim()) {
    return NextResponse.json({ error: "Falta el nombre del anuncio." }, { status: 400 });
  }
  if (!rapida && (!adType || !phase || !visualFormat || !angle || !awarenessLevel || !marketOrigin)) {
    return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
  }
  const finalStatus = REQUIREMENT_STATUSES.includes(status as never) ? status : "PENDIENTE";

  const ahora = new Date();
  if (visualFormat) {
    const choque = await formatoRepetido(session.organizationId, {
      productId: productId || null,
      ronda: ronda ?? null,
      date: ahora,
      visualFormat,
    });
    if (choque) {
      return NextResponse.json(
        {
          error: `El formato «${visualFormat}» ya lo usa «${choque.adName}» en el mismo adset. Dentro de un adset cada pieza lleva un formato distinto.`,
        },
        { status: 409 },
      );
    }
  }

  // Un editor que crea una pieza rápida se la queda: es la suya del día.
  const responsable = ownerId || (canManagePipeline(session.role) ? null : session.userId);

  const requirement = await db.requirement.create({
    data: {
      organizationId: session.organizationId,
      productId: productId || null,
      adName: adName.trim(),
      externalId1: externalId1 || null,
      externalId2: externalId2 || null,
      adType: adType ?? "",
      phase: phase ?? "",
      visualFormat: visualFormat ?? "",
      angle: angle ?? "",
      awarenessLevel: awarenessLevel ?? "",
      marketOrigin: marketOrigin ?? "",
      ronda: ronda?.trim() || null,
      ownerId: responsable,
      status: finalStatus as never,
      dueDate: dueDate ? new Date(dueDate) : null,
      thumbnailUrl: thumbnailUrl || null,
    },
    include: {
      product: { select: { code: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  // Con fecha de entrega, la pieza aparece sola en el tablero del día y en el
  // calendario. Sin ella no pasa nada: no habría día en el que ponerla.
  await sincronizarTareaDeRequerimiento(requirement.id);
  // A quien le toca la pieza, si no la creó para sí mismo.
  await avisarAsignacion(requirement.id, session.userId);

  return NextResponse.json({ requirement });
}
