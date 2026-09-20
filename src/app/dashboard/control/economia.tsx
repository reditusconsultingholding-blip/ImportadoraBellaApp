"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { urlSegura } from "@/lib/url-segura";

// La pestaña VARIABLES de la planilla, editable acá.
//
// Va por mes y no por producto a secas porque es lo que cambia: un producto
// pasó de 58% de efectividad en abril a 100% en julio y a 20% en agosto.
// Guardar un solo número para toda la historia hace que la utilidad de abril
// se recalcule con la realidad de agosto cada vez que alguien toca la ficha.
//
// Se guarda celda por celda, al salir del campo. Es la misma mecánica del
// tablero de contenido: quien carga esto viene de un Excel, y un formulario
// con botón de guardar por fila es exactamente la fricción que hace que se
// siga cargando en el Excel.

type ProductoOpcion = { id: string; code: string; name: string };
type Variable = {
  productId: string;
  efectividad: number;
  produccion: number;
  flete: number;
  precioProm: number;
  cpaMin: number | null;
  devoluciones: number | null;
};

const CAMPOS = [
  { clave: "efectividad", titulo: "Efectividad", sufijo: "%", porcentaje: true },
  { clave: "produccion", titulo: "Producción", sufijo: "$" },
  { clave: "flete", titulo: "Flete", sufijo: "$" },
  { clave: "precioProm", titulo: "Precio prom.", sufijo: "$" },
  { clave: "cpaMin", titulo: "CPA máx.", sufijo: "$" },
  { clave: "devoluciones", titulo: "Devoluciones", sufijo: "%", porcentaje: true },
] as const;

type Clave = (typeof CAMPOS)[number]["clave"];

const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default function Economia({
  anio,
  mes,
  productos,
  pautados,
  variables,
  gastoAdm,
  enlaceAdm,
}: {
  anio: number;
  mes: number;
  productos: ProductoOpcion[];
  /** Los que tuvieron gasto ese mes. Es el filtro por defecto de la tabla. */
  pautados: string[];
  variables: Variable[];
  gastoAdm: number | null;
  enlaceAdm: string | null;
}) {
  const router = useRouter();
  // Lo que manda es lo que llega del servidor; `editado` solo guarda lo que se
  // acaba de escribir, para que la celda no parpadee mientras el servidor
  // contesta. Sembrar el estado una sola vez con los props era un error: al
  // traer el mes anterior, la tabla seguía mostrando el mes vacío hasta que
  // alguien recargaba la página entera.
  const base = useMemo(() => new Map(variables.map((v) => [v.productId, v])), [variables]);
  const [editado, setEditado] = useState<Map<string, Variable>>(new Map());
  const filas = useMemo(() => new Map([...base, ...editado]), [base, editado]);
  const [adm, setAdm] = useState(gastoAdm === null ? "" : String(gastoAdm));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  // Qué productos se listan. Por defecto los que se pautaron ese mes: la
  // tabla traía el catálogo entero —incluidos los que no se pautan hace
  // meses— y encontrar el que se busca era el trabajo.
  const [filtro, setFiltro] = useState<"pautados" | "cargados" | "todos">("pautados");
  const [copiando, setCopiando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Trae la economía del mes anterior para los productos que todavía no tienen.
   *
   * No pisa lo ya cargado, así que apretarlo dos veces no deshace una
   * corrección hecha a mano. Es un punto de partida, no un cierre: lo que
   * cambió este mes hay que corregirlo igual.
   */
  async function copiarDelAnterior() {
    setCopiando(true);
    setAviso(null);
    setError(null);
    try {
      const res = await fetch("/api/control/economia/copiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio, mes }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      setAviso(
        j.copiados === 0
          ? `No había nada que traer: todos los productos de ${j.desde} ya tienen fila en este mes.`
          : `Se trajeron ${j.copiados} productos de ${j.desde}. Revisá y corregí lo que cambió.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCopiando(false);
    }
  }

  async function guardar(productId: string, clave: Clave, texto: string) {
    const bruto = texto.trim() === "" ? null : Number(texto.replace(",", "."));
    if (bruto !== null && !isFinite(bruto)) return;
    const campo = CAMPOS.find((c) => c.clave === clave)!;
    const valor = bruto === null ? null : "porcentaje" in campo && campo.porcentaje ? bruto / 100 : bruto;

    const previas = editado;
    const actual = filas.get(productId) ?? {
      productId,
      efectividad: 0,
      produccion: 0,
      flete: 0,
      precioProm: 0,
      cpaMin: null,
      devoluciones: null,
    };
    const siguiente = { ...actual, [clave]: valor ?? 0 } as Variable;
    if (clave === "cpaMin" || clave === "devoluciones") siguiente[clave] = valor;

    setEditado((m) => new Map(m).set(productId, siguiente));
    setGuardando(`${productId}:${clave}`);
    setError(null);
    try {
      const res = await fetch("/api/control/economia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio, mes, ...siguiente }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setEditado(previas);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(null);
    }
  }

  async function guardarAdm(cambios: { valor?: string; enlace?: string }) {
    const cuerpo: { anio: number; mes: number; valor?: number; enlace?: string | null } = { anio, mes };
    if (cambios.valor !== undefined) {
      const valor = Number(cambios.valor.replace(/[^\d.,]/g, "").replace(",", "."));
      if (cambios.valor.trim() === "" || !isFinite(valor)) return;
      cuerpo.valor = valor;
    }
    if (cambios.enlace !== undefined) cuerpo.enlace = cambios.enlace.trim() || null;
    setError(null);
    try {
      const res = await fetch("/api/control/gasto-adm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const conPauta = useMemo(() => new Set(pautados), [pautados]);
  const visibles =
    filtro === "cargados"
      ? productos.filter((p) => filas.has(p.id))
      : filtro === "pautados"
        ? productos.filter((p) => conPauta.has(p.id) || filas.has(p.id))
        : productos;
  const campo =
    "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums outline-none hover:border-border focus:border-accent focus:bg-surface";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4 rounded border border-border bg-surface p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.07em] text-muted">
            Gasto administrativo de {NOMBRE_MES[mes - 1]}
          </span>
          <input
            defaultValue={adm}
            onChange={(e) => setAdm(e.target.value)}
            onBlur={(e) => guardarAdm({ valor: e.target.value })}
            placeholder="22713"
            className="w-44 rounded border border-border bg-surface px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-accent"
          />
        </label>
        {/* El enlace al documento de administración, al lado del número: de
            ahí sale el total, y tenerlo a un clic deja ver de qué está hecho
            sin preguntarle a nadie. */}
        <label className="flex min-w-[260px] flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.07em] text-muted">
            Documento de administración
          </span>
          <div className="flex items-center gap-2">
            <input
              key={enlaceAdm ?? ""}
              defaultValue={enlaceAdm ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() !== (enlaceAdm ?? "")) guardarAdm({ enlace: e.target.value });
              }}
              placeholder="https://docs.google.com/…"
              className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            {enlaceAdm && (
              <a
                href={urlSegura(enlaceAdm)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs font-medium text-accent-strong underline-offset-2 hover:underline"
              >
                Abrir ↗
              </a>
            )}
          </div>
        </label>
        <p className="w-full text-xs leading-relaxed text-muted">
          El total del mes, entero. Se divide entre 30 para sacar el del día y ese día se reparte
          entre los productos según sus pedidos — igual que en la planilla. Sin este número la
          utilidad sale más alta de lo real.
        </p>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={copiarDelAnterior}
            disabled={copiando}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-60"
          >
            {copiando ? "Copiando…" : "Traer del mes anterior"}
          </button>
          <span className="flex flex-wrap gap-1">
            {(
              [
                ["pautados", `Pautados este mes (${productos.filter((p) => conPauta.has(p.id) || filas.has(p.id)).length})`],
                ["cargados", `Con datos (${filas.size})`],
                ["todos", `Todos (${productos.length})`],
              ] as const
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  filtro === id
                    ? "border-accent bg-good-bg text-accent-strong"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {texto}
              </button>
            ))}
          </span>
        </div>
      </div>

      {aviso && (
        <p className="rounded border border-accent bg-good-bg px-3 py-2 text-xs text-accent-strong">
          {aviso}
        </p>
      )}

      {error && (
        <p className="rounded border border-critical bg-critical-bg px-3 py-2 text-xs text-critical">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
              <th className="px-2.5 py-2">Producto</th>
              {CAMPOS.map((c) => (
                <th key={c.clave} className="px-2.5 py-2 text-right">
                  {c.titulo} <span className="font-normal normal-case">({c.sufijo})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const v = filas.get(p.id);
              return (
                <tr key={p.id} className="border-b border-border last:border-b-0">
                  <td className="px-2.5 py-1">
                    <span className="block max-w-[260px] truncate">{p.name}</span>
                    <span className="text-[10px] text-muted">{p.code}</span>
                  </td>
                  {CAMPOS.map((c) => {
                    const crudo = v ? (v[c.clave] as number | null) : null;
                    const mostrado =
                      crudo === null || crudo === undefined
                        ? ""
                        : "porcentaje" in c && c.porcentaje
                          ? String(Math.round(crudo * 1000) / 10)
                          : String(crudo);
                    return (
                      <td key={c.clave} className="px-1 py-1">
                        <input
                          key={mostrado}
                          defaultValue={mostrado}
                          onBlur={(e) => {
                            if (e.target.value !== mostrado) guardar(p.id, c.clave, e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          placeholder="—"
                          className={`${campo} ${guardando === `${p.id}:${c.clave}` ? "opacity-50" : ""}`}
                          aria-label={`${c.titulo} de ${p.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        Se guarda solo al salir de cada celda. Los porcentajes se escriben como número entero: 58
        para 58%. Un producto sin fila cargada en este mes se calcula con los números de su ficha,
        que son los mismos para toda la historia — el control lo avisa cuando pasa.
      </p>
    </div>
  );
}
