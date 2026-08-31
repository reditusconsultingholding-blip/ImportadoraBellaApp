import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { revisarAnuncio, type AnuncioVista } from "@/lib/anuncios-datos";

// Anuncios a todo el equipo.
//
// Publicar es de dirección (`canManagePipeline`) y eso se decide ACÁ, no
// escondiendo el formulario: el botón oculto solo evita el clic accidental,
// mientras que un POST a mano lo saltea sin esfuerzo.
//
// Leer es de cualquiera que tenga acceso al chat. Quien todavía no tiene rol
// no ve la conversación del equipo, así que tampoco los avisos internos.

/** Una fila de anuncio tal como la leen las dos consultas de esta ruta. */
type FilaAnuncio = {
  id: string;
  titulo: string;
  cuerpo: string;
  createdAt: Date;
  archivadoAt: Date | null;
  autor: { id: string; name: string };
  vistos: { userId: string }[];
  _count: { vistos: number };
};

const INCLUDE_ANUNCIO = {
  autor: { select: { id: true, name: true } },
  _count: { select: { vistos: true } },
};

/**
 * Cuántos anuncios se devuelven.
 *
 * Es la lista de "lo que se anunció", no un archivo histórico: pasados unos
 * cuantos, lo viejo ya no se consulta y lo único que hace es alargar la
 * respuesta que pide cada persona al entrar a la app.
 */
const TOPE = 50;

function aVista(a: FilaAnuncio, destinatarios: number): AnuncioVista {
  return {
    id: a.id,
    titulo: a.titulo,
    cuerpo: a.cuerpo,
    createdAt: a.createdAt.toISOString(),
    autor: a.autor,
    // `vistos` viene filtrado por la sesión en el where del include, así que
    // que traiga una fila significa "yo ya lo vi".
    visto: a.vistos.length > 0,
    vistoPor: a._count.vistos,
    destinatarios,
    archivado: a.archivadoAt !== null,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ anuncios: [], pendientes: [], puedePublicar: false });
  }

  const [filas, destinatarios] = await Promise.all([
    db.anuncio.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      take: TOPE,
      include: {
        ...INCLUDE_ANUNCIO,
        // El "visto" se pide filtrado por la sesión en vez de traer la lista
        // entera y buscarse adentro: con veinte personas y cincuenta anuncios
        // serían mil filas viajando para responder un sí o un no.
        vistos: { where: { userId: session.userId }, select: { userId: true } },
      },
    }),
    // Quién podría verlo: el equipo con acceso al chat. Sirve para que la
    // pantalla diga "3 de 8" — un "3" suelto no dice si falta medio equipo.
    db.user.count({
      where: {
        organizationId: session.organizationId,
        role: { in: ["OWNER", "DIRECTOR", "EDITOR"] },
      },
    }),
  ]);

  const anuncios = filas.map((a) => aVista(a, destinatarios));

  return NextResponse.json({
    anuncios,
    // Lo que le tiene que saltar a esta persona al entrar: publicado, todavía
    // no retirado y sin acusar. El filtro es por persona, así que el userId va
    // en la consulta y no se resuelve en el navegador.
    pendientes: anuncios.filter((a) => !a.visto && !a.archivado),
    puedePublicar: canManagePipeline(session.role),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json(
      { error: "Solo dirección puede publicar anuncios al equipo." },
      { status: 403 }
    );
  }

  const { titulo, cuerpo } = (await req.json()) as { titulo?: string; cuerpo?: string };
  const t = (titulo ?? "").trim();
  const c = (cuerpo ?? "").trim();

  const problema = revisarAnuncio(t, c);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const creado = await db.anuncio.create({
    data: {
      organizationId: session.organizationId,
      autorId: session.userId,
      titulo: t,
      cuerpo: c,
    },
    select: { id: true },
  });

  // No se marca visto para quien lo publica. Podría parecer cómodo, pero el
  // aviso al entrar también le sirve a quien escribió: es la última
  // oportunidad de ver el anuncio como lo va a ver el equipo.
  return NextResponse.json({ ok: true, id: creado.id });
}

/**
 * Retirar un anuncio.
 *
 * No lo borra: le pone fecha de archivado y deja de aparecerle a quien todavía
 * no lo vio. Borrarlo de verdad se llevaría también quiénes lo habían acusado,
 * que es justamente la parte que no se puede reconstruir.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Solo dirección puede retirar anuncios." }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el anuncio." }, { status: 400 });

  // La organización va en el WHERE y no en un chequeo posterior: así una id de
  // otra empresa no encuentra fila en vez de encontrarla y depender de que el
  // código de abajo se acuerde de compararla.
  const cambiados = await db.anuncio.updateMany({
    where: { id, organizationId: session.organizationId, archivadoAt: null },
    data: { archivadoAt: new Date() },
  });
  if (cambiados.count === 0) {
    return NextResponse.json({ error: "Ese anuncio no existe o ya se retiró." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
