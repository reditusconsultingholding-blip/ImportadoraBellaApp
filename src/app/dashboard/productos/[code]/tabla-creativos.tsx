"use client";

import { useMemo, useState } from "react";
import {
  AD_TYPES,
  ANGLES,
  AWARENESS_LEVELS,
  ESTADOS_CREATIVO,
  MARKET_ORIGINS,
  PHASES,
  PROXIMAS_ACCIONES,
  REQUIREMENT_STATUSES,
  STATUS_LABEL,
  VISUAL_FORMATS,
  leerHookRate,
} from "@/lib/pipeline-options";

export type Creativo = {
  id: string;
  date: string | null;
  adName: string;
  adType: string;
  phase: string;
  visualFormat: string;
  angle: string;
  awarenessLevel: string;
  marketOrigin: string;
  ownerId: string | null;
  ownerName: string | null;
  status: string;
  estado: string | null;
  ronda: string | null;
  fbPostLink: string | null;
  tiktokPostLink: string | null;
  originalVideoLink: string | null;
  externalId1: string | null;
  hookRate: number | null;
  ctr: number | null;
  holdRate: number | null;
  purchases: number | null;
  cpa: number | null;
  frequency: number | null;
  cpm: number | null;
  nextAction: string | null;
  notes: string | null;
};

type Persona = { id: string; name: string };

// El orden de la planilla, para que quien viene del Excel encuentre todo donde
// lo espera.
type Columna = {
  id: keyof Creativo | "ownerId";
  titulo: string;
  ancho: string;
  tipo: "texto" | "fecha" | "numero" | "link" | "lista" | "persona" | "larga";
  opciones?: readonly string[];
};

const COLUMNAS: Columna[] = [
  { id: "date", titulo: "Fecha", ancho: "8rem", tipo: "fecha" },
  { id: "adName", titulo: "Nombre", ancho: "16rem", tipo: "texto" },
  { id: "adType", titulo: "Tipo de anuncio", ancho: "11rem", tipo: "lista", opciones: AD_TYPES },
  { id: "phase", titulo: "Fase", ancho: "7rem", tipo: "lista", opciones: PHASES },
  { id: "visualFormat", titulo: "Formato visual", ancho: "13rem", tipo: "lista", opciones: VISUAL_FORMATS },
  { id: "angle", titulo: "Ángulo", ancho: "13rem", tipo: "lista", opciones: ANGLES },
  { id: "awarenessLevel", titulo: "Awareness", ancho: "12rem", tipo: "lista", opciones: AWARENESS_LEVELS },
  { id: "marketOrigin", titulo: "Mercado origen", ancho: "9rem", tipo: "lista", opciones: MARKET_ORIGINS },
  { id: "ownerId", titulo: "Editor", ancho: "10rem", tipo: "persona" },
  { id: "status", titulo: "Situación", ancho: "10rem", tipo: "lista", opciones: REQUIREMENT_STATUSES },
  { id: "fbPostLink", titulo: "Publicación FB", ancho: "8rem", tipo: "link" },
  { id: "tiktokPostLink", titulo: "Link", ancho: "8rem", tipo: "link" },
  { id: "originalVideoLink", titulo: "Video original / F2", ancho: "8rem", tipo: "link" },
  { id: "externalId1", titulo: "ID", ancho: "8rem", tipo: "texto" },
  { id: "hookRate", titulo: "Hook rate", ancho: "8rem", tipo: "numero" },
  { id: "ctr", titulo: "CTR", ancho: "6rem", tipo: "numero" },
  { id: "holdRate", titulo: "Hold rate", ancho: "7rem", tipo: "numero" },
  { id: "purchases", titulo: "Compras", ancho: "7rem", tipo: "numero" },
  { id: "cpa", titulo: "CPA", ancho: "6rem", tipo: "numero" },
  { id: "frequency", titulo: "Frecuencia", ancho: "7rem", tipo: "numero" },
  { id: "cpm", titulo: "CPM", ancho: "6rem", tipo: "numero" },
  { id: "estado", titulo: "Estado", ancho: "12rem", tipo: "lista", opciones: ESTADOS_CREATIVO },
  { id: "nextAction", titulo: "Próxima acción", ancho: "12rem", tipo: "lista", opciones: PROXIMAS_ACCIONES },
  { id: "notes", titulo: "Nota de aprendizaje", ancho: "18rem", tipo: "larga" },
];

const celdaBase =
  "w-full border-0 bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-surface focus:ring-1 focus:ring-accent";

export default function TablaCreativos({
  inicial,
  personas,
  puedeEditar,
}: {
  inicial: Creativo[];
  personas: Persona[];
  puedeEditar: boolean;
}) {
  const [filas, setFilas] = useState(inicial);
  const [guardando, setGuardando] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // El servidor manda la verdad en cada refresh; el estado local existe para
  // que escribir en una celda se sienta inmediato.
  const [ultimas, setUltimas] = useState(inicial);
  if (inicial !== ultimas) {
    setUltimas(inicial);
    setFilas(inicial);
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      `${f.adName} ${f.angle} ${f.visualFormat} ${f.estado ?? ""} ${f.externalId1 ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [filas, busqueda]);

  async function guardar(id: string, campo: string, valor: string) {
    // Se pinta primero y se manda después: esperar la respuesta por cada tecla
    // haría que la tabla se sienta trabada.
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor || null } : f)));
    setGuardando((prev) => new Set(prev).add(id));
    setError(null);
    try {
      const res = await fetch(`/api/requirements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "No se pudo guardar ese cambio.");
      }
    } catch {
      setError("No se pudo guardar ese cambio.");
    } finally {
      setGuardando((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function valorDe(f: Creativo, c: Columna): string {
    if (c.id === "ownerId") return f.ownerId ?? "";
    const v = f[c.id as keyof Creativo];
    if (v == null) return "";
    if (c.tipo === "fecha") return String(v).slice(0, 10);
    return String(v);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en las piezas…"
          className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent sm:max-w-xs"
        />
        <span className="text-xs text-muted">
          {visibles.length} de {filas.length} piezas
        </span>
        {guardando.size > 0 && <span className="text-xs text-muted">Guardando…</span>}
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="table-cols w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
              {COLUMNAS.map((c) => (
                <th key={c.id} className="whitespace-nowrap px-2 py-2 font-semibold" style={{ minWidth: c.ancho }}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={COLUMNAS.length} className="px-3 py-10 text-center text-muted">
                  Todavía no hay piezas para este producto.
                </td>
              </tr>
            )}

            {visibles.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-b-0 align-top">
                {COLUMNAS.map((c) => (
                  <td key={c.id} className="p-0" style={{ minWidth: c.ancho }}>
                    <Celda
                      columna={c}
                      valor={valorDe(f, c)}
                      personas={personas}
                      puedeEditar={puedeEditar}
                      onGuardar={(v) => guardar(f.id, c.id === "ownerId" ? "ownerId" : (c.id as string), v)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Celda({
  columna: c,
  valor,
  personas,
  puedeEditar,
  onGuardar,
}: {
  columna: Columna;
  valor: string;
  personas: Persona[];
  puedeEditar: boolean;
  onGuardar: (v: string) => void;
}) {
  const [local, setLocal] = useState(valor);

  // Si el valor cambió afuera (otra persona, un refresh), se toma el de afuera.
  const [ultimo, setUltimo] = useState(valor);
  if (valor !== ultimo) {
    setUltimo(valor);
    setLocal(valor);
  }

  if (!puedeEditar) {
    return <span className="block px-2 py-1.5 text-sm">{textoDe(c, valor, personas)}</span>;
  }

  if (c.tipo === "lista") {
    return (
      <select
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          onGuardar(e.target.value);
        }}
        className={`${celdaBase} cursor-pointer`}
      >
        <option value="">—</option>
        {c.opciones?.map((o) => (
          <option key={o} value={o}>
            {c.id === "status" ? (STATUS_LABEL[o] ?? o) : o}
          </option>
        ))}
      </select>
    );
  }

  if (c.tipo === "persona") {
    return (
      <select
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          onGuardar(e.target.value);
        }}
        className={`${celdaBase} cursor-pointer`}
      >
        <option value="">Sin asignar</option>
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }

  if (c.tipo === "larga") {
    return (
      <textarea
        value={local}
        rows={2}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== valor && onGuardar(local)}
        className={`${celdaBase} resize-y`}
      />
    );
  }

  const lectura = c.id === "hookRate" ? leerHookRate(local === "" ? null : Number(local)) : null;

  return (
    <span className="relative block">
      <input
        type={c.tipo === "fecha" ? "date" : c.tipo === "numero" ? "number" : "text"}
        step={c.tipo === "numero" ? "0.01" : undefined}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== valor && onGuardar(local)}
        className={`${celdaBase} ${c.tipo === "numero" ? "text-right tabular-nums" : ""}`}
      />
      {/* El hook rate se lee distinto según el tramo, y decirlo al lado evita
          tener que recordar los cortes de memoria. */}
      {lectura && (
        <span
          className={`pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] ${
            lectura.tono === "malo"
              ? "text-critical"
              : lectura.tono === "medio"
                ? "text-warning"
                : "text-good"
          }`}
        >
          {lectura.texto}
        </span>
      )}
      {c.tipo === "link" && local && (
        <a
          href={local}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute right-1 top-1/2 -translate-y-1/2 text-xs text-accent-strong"
          title="Abrir"
        >
          ↗
        </a>
      )}
    </span>
  );
}

function textoDe(c: Columna, valor: string, personas: Persona[]) {
  if (!valor) return "—";
  if (c.id === "ownerId") return personas.find((p) => p.id === valor)?.name ?? "—";
  if (c.id === "status") return STATUS_LABEL[valor] ?? valor;
  return valor;
}
