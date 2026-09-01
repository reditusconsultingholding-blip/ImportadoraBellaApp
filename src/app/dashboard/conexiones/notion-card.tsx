import Link from "next/link";

export default function NotionCard({
  conectado,
  lastImportAt,
}: {
  conectado: boolean;
  lastImportAt: string | null;
}) {
  return (
    <div className="bg-surface border border-border rounded p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Notion (migración única)</p>
          <p className="text-xs text-muted">
            Traer las bases de tareas y campañas del equipo a la app, una sola vez, y apagar Notion.
          </p>
        </div>
        <span
          className={`font-mono text-xs px-2 py-1 rounded ${
            conectado ? "bg-good-bg text-good" : lastImportAt ? "bg-surface-2 text-muted" : "bg-surface-2 text-muted"
          }`}
        >
          {conectado ? "Conectado" : lastImportAt ? "Importado y cerrado" : "Sin conectar"}
        </span>
      </div>

      <Link
        href="/dashboard/contenido/importar"
        className="mt-3 inline-block text-xs font-medium text-accent-strong hover:underline"
      >
        Abrir el asistente de import →
      </Link>
    </div>
  );
}
