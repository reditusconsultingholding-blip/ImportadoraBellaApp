import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { importarNotion } from "@/lib/integrations/notion-import";
import { NotionError } from "@/lib/integrations/notion";

// El import puede leer varios cientos de filas y hacer una llamada por cada
// página relacionada — se le da margen.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Importar de Notion es de dirección." }, { status: 403 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  try {
    const reporte = await importarNotion(session.organizationId, { dryRun });
    return NextResponse.json({ ok: true, dryRun, reporte });
  } catch (err) {
    if (err instanceof NotionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo completar el import." },
      { status: 500 }
    );
  }
}
