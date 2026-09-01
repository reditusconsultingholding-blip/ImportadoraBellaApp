"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Columna = { base: string; titulo: string; propiedades: { nombre: string; tipo: string }[] };
type Reporte = {
  tareas: { creadas: number; actualizadas: number; sinProducto: string[]; sinResponsable: string[]; sinFecha: number };
  campanas: { manualCreadas: number; manualActualizadas: number; vinculadas: number; sinMatch: number };
  columnasNoMapeadas: { base: string; columnas: string[] }[];
  muestras: Record<string, unknown>[];
};

const CAMPO = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";
const LABEL = "block text-xs font-mono uppercase tracking-wide text-muted mb-1";

export default function ImportadorNotion({
  conectado,
  lastImportAt,
}: {
  conectado: boolean;
  lastImportAt: string | null;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2 | 3>(conectado ? 2 : 1);
  const [token, setToken] = useState("");
  const [tareasLink, setTareasLink] = useState("");
  const [campanasLink, setCampanasLink] = useState("");
  const [columnas, setColumnas] = useState<Columna[]>([]);
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, tareasLink, campanasLink }),
      });
      const data = (await res.json()) as { columnas?: Columna[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo conectar.");
        return;
      }
      setColumnas(data.columnas ?? []);
      setPaso(2);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function importar(dry: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notion/importar${dry ? "?dry=1" : ""}`, { method: "POST" });
      const data = (await res.json()) as { reporte?: Reporte; error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo importar.");
        return;
      }
      setReporte(data.reporte ?? null);
      if (!dry) {
        setPaso(3);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function desconectar() {
    if (!confirm("Se corta la conexión con Notion. Lo ya importado se queda. ¿Sigo?")) return;
    setBusy(true);
    await fetch("/api/notion/desconectar", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Paso 1: conectar */}
      <section className={`rounded border p-4 ${paso === 1 ? "border-accent bg-surface" : "border-border bg-surface-2/40"}`}>
        <h2 className="text-sm font-semibold">1 · Conectar Notion</h2>
        <ol className="mt-2 list-decimal pl-4 text-xs text-muted">
          <li>
            En <code>notion.so/my-integrations</code>, crea una integración interna del workspace de
            Importadora Bella y copia su <em>Internal Integration Secret</em> (empieza con <code>ntn_</code>).
          </li>
          <li>
            En Notion, abre cada base → ••• → Connections → agrega la integración.
          </li>
          <li>Pega abajo el token y el link de cada base (de la barra de direcciones del navegador).</li>
        </ol>

        {paso === 1 && (
          <form onSubmit={conectar} className="mt-3 flex flex-col gap-3">
            <label>
              <span className={LABEL}>Token de la integración</span>
              <input value={token} onChange={(e) => setToken(e.target.value)} type="password" required placeholder="ntn_..." className={CAMPO} />
            </label>
            <label>
              <span className={LABEL}>Link de la base de tareas diarias</span>
              <input value={tareasLink} onChange={(e) => setTareasLink(e.target.value)} placeholder="https://www.notion.so/…" className={CAMPO} />
            </label>
            <label>
              <span className={LABEL}>Link de la base de gestión de campañas</span>
              <input value={campanasLink} onChange={(e) => setCampanasLink(e.target.value)} placeholder="https://www.notion.so/…" className={CAMPO} />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="self-start rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "Conectando…" : "Conectar y ver columnas"}
            </button>
          </form>
        )}

        {paso !== 1 && (
          <p className="mt-2 text-xs text-good">Conectado.</p>
        )}

        {columnas.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {columnas.map((c) => (
              <div key={c.base} className="rounded border border-border bg-surface p-2.5">
                <p className="text-xs font-medium">
                  {c.base === "tareas" ? "Tareas diarias" : "Gestión de campañas"} · {c.titulo}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {c.propiedades.map((p) => `${p.nombre} (${p.tipo})`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Paso 2: dry-run + import */}
      <section className={`rounded border p-4 ${paso === 2 ? "border-accent bg-surface" : "border-border bg-surface-2/40"}`}>
        <h2 className="text-sm font-semibold">2 · Revisar y traer</h2>
        <p className="mt-1 text-xs text-muted">
          Primero una simulación que no escribe nada: muestra cuántas filas entrarían y cuáles no
          matchearon producto o responsable. Si se ve bien, se hace el import real.
        </p>

        {paso === 2 && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => importar(true)}
              disabled={busy}
              className="rounded border border-border px-3 py-1.5 text-xs font-medium transition hover:border-border-strong disabled:opacity-60"
            >
              {busy ? "Simulando…" : "Simular (dry-run)"}
            </button>
            <button
              onClick={() => importar(false)}
              disabled={busy || !reporte}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
              title={!reporte ? "Corre primero la simulación" : ""}
            >
              Importar de verdad
            </button>
          </div>
        )}

        {reporte && (
          <div className="mt-3 flex flex-col gap-2 text-xs">
            <p>
              <strong>Tareas:</strong> {reporte.tareas.creadas} nuevas · {reporte.tareas.actualizadas} actualizadas ·{" "}
              {reporte.tareas.sinProducto.length} sin producto · {reporte.tareas.sinResponsable.length} sin responsable ·{" "}
              {reporte.tareas.sinFecha} sin fecha
            </p>
            <p>
              <strong>Campañas:</strong> {reporte.campanas.manualCreadas} nuevas ·{" "}
              {reporte.campanas.manualActualizadas} actualizadas · {reporte.campanas.vinculadas} ya sincronizadas ·{" "}
              {reporte.campanas.sinMatch} sin producto
            </p>
            {reporte.columnasNoMapeadas.map((c) => (
              <p key={c.base} className="text-warning">
                Columnas de {c.base === "tareas" ? "tareas" : "campañas"} que no se mapearon: {c.columnas.join(", ")}
              </p>
            ))}
            {reporte.tareas.sinResponsable.length > 0 && (
              <p className="text-muted">
                Sin responsable (reasignar después en el tablero): {reporte.tareas.sinResponsable.slice(0, 10).join(", ")}
                {reporte.tareas.sinResponsable.length > 10 && "…"}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Paso 3: cortar */}
      <section className={`rounded border p-4 ${paso === 3 ? "border-accent bg-surface" : "border-border bg-surface-2/40"}`}>
        <h2 className="text-sm font-semibold">3 · Apagar Notion</h2>
        <p className="mt-1 text-xs text-muted">
          Una vez revisado que todo entró, se corta la conexión. Lo importado se queda; el equipo pasa
          a trabajar solo en la app.
        </p>
        {lastImportAt && (
          <p className="mt-1 text-xs text-good">
            Último import: {new Date(lastImportAt).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
          </p>
        )}
        <button
          onClick={desconectar}
          disabled={busy || !conectado}
          className="mt-3 rounded border border-critical/40 px-3 py-1.5 text-xs font-medium text-critical transition hover:bg-critical-bg disabled:opacity-40"
        >
          Desconectar Notion
        </button>
      </section>

      {error && (
        <p className="rounded border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{error}</p>
      )}
    </div>
  );
}
