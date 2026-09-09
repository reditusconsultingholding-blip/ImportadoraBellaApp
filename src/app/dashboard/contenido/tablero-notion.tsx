"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ESTADOS_TAREA,
  ESTADO_TAREA_LABEL,
  PLATAFORMAS,
  PLATAFORMA_LABEL,
  type EstadoTarea,
} from "@/lib/contenido-opciones";

// El tablero del día, con la mecánica de Notion.
//
// POR QUÉ ESTA PANTALLA EXISTE
// El equipo lleva su día en Notion: una base por jornada, se hace clic en una
// celda, se escribe, y ya está. No hay botón de guardar ni formulario. Cuando
// una herramienta nueva pide abrir un modal, llenar campos y confirmar para
// cambiar un estado, la gente vuelve a Notion — no porque la herramienta sea
// peor, sino porque cada cambio cuesta cinco veces más.
//
// Así que la mecánica se copia entera: cada celda se edita en su lugar, guarda
// al salir del campo o con Enter, y la fila nueva se crea escribiendo en la
// última línea. Lo que cambia respecto de Notion es lo de abajo: acá el
// producto se enlaza con su ficha, su pauta y su rentabilidad.
//
// POR QUÉ SE PINTA ANTES DE QUE EL SERVIDOR CONTESTE
// Porque en Notion es instantáneo. Se aplica el cambio en pantalla, se manda,
// y si el servidor lo rechaza se revierte con un aviso. Esperar la respuesta
// para mostrarla es lo que hace que una tabla se sienta pesada.

type UserOption = { id: string; name: string };
type ProductOption = { id: string; code: string; name: string };

export type TareaFila = {
  id: string;
  fecha: string | null;
  ownerId: string | null;
  responsableTexto: string | null;
  owner: UserOption | null;
  productId: string | null;
  productoTexto: string | null;
  product: ProductOption | null;
  plataforma: string | null;
  numeroCreativos: number;
  estado: string;
  notas: string | null;
};

/* --------------------------------- Colores -------------------------------- */

// Pastillas de estado, como las de Notion: fondo suave, texto del mismo tono.
const TONO_ESTADO: Record<EstadoTarea, string> = {
  PENDIENTE: "bg-surface-2 text-muted",
  EN_PROGRESO: "bg-pending-bg text-warning",
  HECHO: "bg-good-bg text-good",
  NO_CUMPLIDO: "bg-critical-bg text-critical",
  POR_PAUTAR: "bg-good-bg text-accent-strong",
};

const esEstado = (v: string): v is EstadoTarea => (ESTADOS_TAREA as readonly string[]).includes(v);

/* --------------------------------- Fechas --------------------------------- */

function hoyEcuador() {
  const ahora = new Date();
  return new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

function tituloDelDia(iso: string) {
  if (iso === "sin-fecha") return "Sin fecha";
  const d = new Date(`${iso}T00:00:00.000Z`);
  const texto = d.toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const hoy = hoyEcuador();
  if (iso === hoy) return `Hoy · ${texto}`;
  const ayer = new Date(new Date(`${hoy}T00:00:00.000Z`).getTime() - 86400_000)
    .toISOString()
    .slice(0, 10);
  if (iso === ayer) return `Ayer · ${texto}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/* ------------------------------ Celdas sueltas ---------------------------- */

const CELDA = "px-2.5 py-1.5 align-top";

/** Texto que se edita donde está. Guarda al salir o con Enter; Escape cancela. */
function CeldaTexto({
  valor,
  onGuardar,
  placeholder,
  editable,
  className = "",
}: {
  valor: string;
  onGuardar: (v: string) => void;
  placeholder?: string;
  editable: boolean;
  className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valor);

  if (!editable) {
    return (
      <span className={`block truncate ${valor ? "" : "text-muted"} ${className}`}>
        {valor || placeholder || "—"}
      </span>
    );
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setBorrador(valor);
          setEditando(true);
        }}
        className={`block w-full truncate rounded px-1 py-0.5 text-left transition hover:bg-surface-2 ${
          valor ? "" : "text-muted"
        } ${className}`}
      >
        {valor || placeholder || "—"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={borrador}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => {
        setEditando(false);
        if (borrador !== valor) onGuardar(borrador);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setBorrador(valor);
          setEditando(false);
        }
      }}
      className={`w-full rounded border border-accent bg-surface px-1 py-0.5 outline-none ${className}`}
    />
  );
}

/** Un select que se ve como texto hasta que se lo toca. */
function CeldaSelect({
  valor,
  opciones,
  onGuardar,
  editable,
  vacio = "—",
  clasePastilla,
}: {
  valor: string;
  opciones: { valor: string; texto: string }[];
  onGuardar: (v: string) => void;
  editable: boolean;
  vacio?: string;
  /** Cuando viene, el valor se dibuja como pastilla de color. */
  clasePastilla?: string;
}) {
  const texto = opciones.find((o) => o.valor === valor)?.texto ?? vacio;

  if (!editable) {
    return clasePastilla ? (
      <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${clasePastilla}`}>
        {texto}
      </span>
    ) : (
      <span className={valor ? "" : "text-muted"}>{texto}</span>
    );
  }

  return (
    <span className="relative inline-block">
      {clasePastilla ? (
        <span
          className={`pointer-events-none inline-block rounded px-2 py-0.5 text-[11px] font-medium ${clasePastilla}`}
        >
          {texto}
        </span>
      ) : (
        <span className={`pointer-events-none ${valor ? "" : "text-muted"}`}>{texto}</span>
      )}
      {/* El select real, transparente y encima: se conserva el menú nativo
          —que en el celular es el que la gente sabe usar— sin heredar su
          aspecto de formulario. */}
      <select
        value={valor}
        onChange={(e) => onGuardar(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Cambiar valor"
      >
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </span>
  );
}

/* -------------------------------- La pantalla ----------------------------- */

export default function TableroNotion({
  canManage,
  currentUserId,
  users,
  products,
}: {
  canManage: boolean;
  currentUserId: string;
  users: UserOption[];
  products: ProductOption[];
}) {
  const [tareas, setTareas] = useState<TareaFila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloMias, setSoloMias] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [creandoEn, setCreandoEn] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/contenido/tareas")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `El servidor respondió ${r.status}`);
        return j as { tareas: TareaFila[] };
      })
      .then((j) => vivo && setTareas(j.tareas))
      .catch((e) => {
        if (!vivo) return;
        setError(e instanceof Error ? e.message : String(e));
        setTareas([]);
      });
    return () => {
      vivo = false;
    };
  }, [recarga]);

  /** Aplica el cambio en pantalla y lo manda; si falla, revierte. */
  const editar = useCallback(
    async (id: string, campo: string, valor: unknown) => {
      const previas = tareas;
      setTareas((t) =>
        t ? t.map((x) => (x.id === id ? ({ ...x, [campo]: valor } as TareaFila) : x)) : t,
      );
      setError(null);
      try {
        const res = await fetch(`/api/contenido/tareas/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [campo]: valor }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
        }
        // La respuesta trae la fila completa —con el producto y el responsable
        // ya resueltos—, así que se adopta entera en lugar de dejar la versión
        // optimista, que solo tiene el id.
        const j = (await res.json()) as { tarea: TareaFila };
        setTareas((t) => (t ? t.map((x) => (x.id === id ? j.tarea : x)) : t));
      } catch (e) {
        setTareas(previas ?? null);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [tareas],
  );

  async function crear(dia: string, productoTexto: string) {
    if (!productoTexto.trim()) return;
    setCreandoEn(null);
    setError(null);
    try {
      const res = await fetch("/api/contenido/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: dia === "sin-fecha" ? undefined : dia,
          productoTexto: productoTexto.trim(),
          ownerId: canManage ? currentUserId : undefined,
          estado: "PENDIENTE",
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      setTareas((t) => (t ? [j.tarea as TareaFila, ...t] : [j.tarea as TareaFila]));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRecarga((n) => n + 1);
    }
  }

  const visibles = useMemo(() => {
    if (!tareas) return [];
    const t = busqueda.trim().toLowerCase();
    return tareas.filter((x) => {
      if (soloMias && x.ownerId !== currentUserId) return false;
      if (!t) return true;
      return (
        (x.product?.name ?? x.productoTexto ?? "").toLowerCase().includes(t) ||
        (x.owner?.name ?? x.responsableTexto ?? "").toLowerCase().includes(t) ||
        (x.notas ?? "").toLowerCase().includes(t)
      );
    });
  }, [tareas, busqueda, soloMias, currentUserId]);

  /** Agrupadas por día, del más reciente al más viejo. */
  const dias = useMemo(() => {
    const mapa = new Map<string, TareaFila[]>();
    for (const t of visibles) {
      const clave = t.fecha ? t.fecha.slice(0, 10) : "sin-fecha";
      const lista = mapa.get(clave) ?? [];
      lista.push(t);
      mapa.set(clave, lista);
    }
    return [...mapa.entries()].sort((a, b) => {
      if (a[0] === "sin-fecha") return 1;
      if (b[0] === "sin-fecha") return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [visibles]);

  const hoy = hoyEcuador();

  /**
   * Qué días arrancan abiertos.
   *
   * Solo hoy y ayer. Con noventa días de historia importada, abrir todo dejaría
   * mil filas en pantalla y el día de trabajo enterrado abajo del todo.
   */
  const estaAbierto = (dia: string) =>
    abiertos[dia] ?? (dia === hoy || dias.findIndex(([d]) => d === dia) === 0);

  const opcionesEstado = ESTADOS_TAREA.map((e) => ({ valor: e, texto: ESTADO_TAREA_LABEL[e] }));
  const opcionesPlataforma = PLATAFORMAS.map((p) => ({ valor: p, texto: PLATAFORMA_LABEL[p] }));
  const opcionesResponsable = users.map((u) => ({ valor: u.id, texto: u.name }));
  const opcionesProducto = products.map((p) => ({ valor: p.id, texto: `${p.code} — ${p.name}` }));

  const claseCampo =
    "rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-border-strong focus:outline-none";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Contenido del día</h2>
          <p className="mt-0.5 text-xs text-muted">
            Igual que en Notion: hacé clic en cualquier celda y escribí. Se guarda solo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, persona o nota"
            className={`${claseCampo} min-w-[200px]`}
            aria-label="Buscar tareas"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={soloMias}
              onChange={(e) => setSoloMias(e.target.checked)}
            />
            Solo las mías
          </label>
        </div>
      </div>

      {error && (
        <p className="rounded border border-critical bg-critical-bg px-3 py-2 text-xs text-critical">
          {error}
        </p>
      )}

      {tareas === null ? (
        <p className="text-sm text-muted">Cargando el tablero…</p>
      ) : dias.length === 0 ? (
        <div className="rounded border border-border bg-surface p-6 text-sm text-muted">
          {busqueda || soloMias
            ? "Ninguna tarea coincide con el filtro."
            : "Todavía no hay tareas cargadas."}
        </div>
      ) : (
        dias.map(([dia, filas]) => {
          const abierto = estaAbierto(dia);
          const hechas = filas.filter((f) => f.estado === "HECHO").length;
          return (
            <section key={dia} className="overflow-hidden rounded border border-border bg-surface">
              <button
                type="button"
                onClick={() => setAbiertos((a) => ({ ...a, [dia]: !abierto }))}
                aria-expanded={abierto}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-surface-2"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden
                  className={`shrink-0 text-muted transition-transform ${abierto ? "rotate-90" : ""}`}
                >
                  <path
                    d="M4.5 3L7.5 6L4.5 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-sm font-medium">{tituloDelDia(dia)}</span>
                <span className="text-xs text-muted">
                  {filas.length} {filas.length === 1 ? "tarea" : "tareas"}
                  {hechas > 0 && ` · ${hechas} ${hechas === 1 ? "lista" : "listas"}`}
                </span>
              </button>

              {abierto && (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                        <th className="px-2.5 py-1.5 font-semibold">Producto</th>
                        <th className="px-2.5 py-1.5 font-semibold">Responsable</th>
                        <th className="px-2.5 py-1.5 font-semibold">Estado</th>
                        <th className="px-2.5 py-1.5 font-semibold">Plataforma</th>
                        <th className="w-16 px-2.5 py-1.5 text-right font-semibold">Nº</th>
                        <th className="px-2.5 py-1.5 font-semibold">Pautado / notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((t) => {
                        // Un editor mueve lo suyo; la dirección mueve todo. Es
                        // la misma regla que ya aplica el servidor: repetirla
                        // acá evita que alguien escriba algo que va a rebotar.
                        const mia = t.ownerId === currentUserId;
                        const puedo = canManage || mia;
                        return (
                          <tr
                            key={t.id}
                            className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-2/60"
                          >
                            <td className={CELDA}>
                              {canManage ? (
                                <CeldaSelect
                                  valor={t.productId ?? ""}
                                  opciones={opcionesProducto}
                                  onGuardar={(v) => editar(t.id, "productId", v || null)}
                                  editable
                                  vacio={t.productoTexto ?? "Sin producto"}
                                />
                              ) : (
                                <span className="block truncate">
                                  {t.product?.name ?? t.productoTexto ?? "—"}
                                </span>
                              )}
                              {t.product && (
                                <span className="mt-0.5 block text-[11px] text-muted">
                                  {t.product.code}
                                </span>
                              )}
                            </td>
                            <td className={CELDA}>
                              <CeldaSelect
                                valor={t.ownerId ?? ""}
                                opciones={opcionesResponsable}
                                onGuardar={(v) => editar(t.id, "ownerId", v || null)}
                                editable={canManage}
                                vacio={t.responsableTexto ?? "Sin asignar"}
                              />
                            </td>
                            <td className={CELDA}>
                              <CeldaSelect
                                valor={t.estado}
                                opciones={opcionesEstado}
                                onGuardar={(v) => editar(t.id, "estado", v || "PENDIENTE")}
                                editable={puedo}
                                clasePastilla={
                                  esEstado(t.estado) ? TONO_ESTADO[t.estado] : TONO_ESTADO.PENDIENTE
                                }
                              />
                            </td>
                            <td className={CELDA}>
                              <CeldaSelect
                                valor={t.plataforma ?? ""}
                                opciones={opcionesPlataforma}
                                onGuardar={(v) => editar(t.id, "plataforma", v || null)}
                                editable={puedo}
                              />
                            </td>
                            <td className={`${CELDA} text-right tabular-nums`}>
                              <CeldaTexto
                                valor={t.numeroCreativos ? String(t.numeroCreativos) : ""}
                                placeholder="0"
                                editable={puedo}
                                className="text-right"
                                onGuardar={(v) =>
                                  editar(t.id, "numeroCreativos", Math.max(0, Number(v) || 0))
                                }
                              />
                            </td>
                            <td className={CELDA}>
                              <CeldaTexto
                                valor={t.notas ?? ""}
                                placeholder="Escribí acá"
                                editable={puedo}
                                onGuardar={(v) => editar(t.id, "notas", v || null)}
                              />
                            </td>
                          </tr>
                        );
                      })}

                      {/* La línea de abajo, como en Notion: se escribe el
                          producto y la fila nace. Sin formulario ni modal. */}
                      <tr className="border-t border-border">
                        <td colSpan={6} className="px-2.5 py-1.5">
                          {creandoEn === dia ? (
                            <input
                              autoFocus
                              placeholder="Nombre del producto y Enter"
                              onBlur={(e) => crear(dia, e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") setCreandoEn(null);
                              }}
                              className="w-full rounded border border-accent bg-surface px-2 py-1 text-sm outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCreandoEn(dia)}
                              className="w-full rounded px-1 py-0.5 text-left text-xs text-muted transition hover:bg-surface-2 hover:text-foreground"
                            >
                              + Nueva tarea
                            </button>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
