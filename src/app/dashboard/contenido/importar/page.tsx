import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageConexiones } from "@/lib/permissions";
import ImportadorNotion from "./importador-notion";

export default async function ImportarNotionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageConexiones(session.role)) redirect("/dashboard/contenido");

  const conexion = await db.notionConnection.findUnique({
    where: { organizationId: session.organizationId },
    select: { connectedAt: true, lastImportAt: true, tareasDatabaseId: true, campanasDatabaseId: true },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link href="/dashboard/contenido" className="text-xs text-muted hover:text-foreground">
          ← Contenido
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Traer todo de Notion</h1>
        <p className="mt-1 text-sm text-muted">
          Migración de una sola vez: se copian las dos bases de Notion (tareas diarias y gestión de
          campañas) a la app, se revisa que todo haya entrado bien, y se apaga Notion.
        </p>
      </div>

      <ImportadorNotion
        conectado={Boolean(conexion?.connectedAt)}
        lastImportAt={conexion?.lastImportAt?.toISOString() ?? null}
      />
    </div>
  );
}
