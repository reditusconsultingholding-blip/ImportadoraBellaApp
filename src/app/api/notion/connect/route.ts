import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { retrieveDatabase, databaseIdFromUrl, NotionError } from "@/lib/integrations/notion";

// Paso 1 del import: guardar el token y los links de las dos bases, y
// validar que la integración tiene acceso leyendo el esquema de cada una.
// Devuelve las columnas detectadas para que se revisen antes del dry-run.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Conectar Notion es de dirección." }, { status: 403 });
  }

  const body = (await req.json()) as { token?: string; tareasLink?: string; campanasLink?: string };
  const token = body.token?.trim();
  if (!token) return NextResponse.json({ error: "Falta el token de la integración." }, { status: 400 });

  const tareasDatabaseId = body.tareasLink?.trim() ? databaseIdFromUrl(body.tareasLink) : null;
  const campanasDatabaseId = body.campanasLink?.trim() ? databaseIdFromUrl(body.campanasLink) : null;

  if (body.tareasLink?.trim() && !tareasDatabaseId) {
    return NextResponse.json({ error: "El link de la base de tareas no tiene la forma esperada." }, { status: 400 });
  }
  if (body.campanasLink?.trim() && !campanasDatabaseId) {
    return NextResponse.json({ error: "El link de la base de campañas no tiene la forma esperada." }, { status: 400 });
  }
  if (!tareasDatabaseId && !campanasDatabaseId) {
    return NextResponse.json({ error: "Pega el link de al menos una base." }, { status: 400 });
  }

  const columnas: { base: string; titulo: string; propiedades: { nombre: string; tipo: string }[] }[] = [];
  try {
    if (tareasDatabaseId) {
      const schema = await retrieveDatabase(token, tareasDatabaseId);
      columnas.push({
        base: "tareas",
        titulo: schema.title,
        propiedades: Object.entries(schema.properties).map(([nombre, p]) => ({ nombre, tipo: p.type })),
      });
    }
    if (campanasDatabaseId) {
      const schema = await retrieveDatabase(token, campanasDatabaseId);
      columnas.push({
        base: "campanas",
        titulo: schema.title,
        propiedades: Object.entries(schema.properties).map(([nombre, p]) => ({ nombre, tipo: p.type })),
      });
    }
  } catch (err) {
    if (err instanceof NotionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo leer de Notion. Revisá el token." }, { status: 502 });
  }

  await db.notionConnection.upsert({
    where: { organizationId: session.organizationId },
    create: {
      organizationId: session.organizationId,
      token,
      tareasDatabaseId,
      campanasDatabaseId,
      connectedAt: new Date(),
    },
    update: { token, tareasDatabaseId, campanasDatabaseId, connectedAt: new Date() },
  });

  return NextResponse.json({ ok: true, columnas });
}
