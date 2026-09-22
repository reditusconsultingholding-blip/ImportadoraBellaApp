"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BuscadorProducto from "../buscador-producto";
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
  /** Cuando la fila nació de un requerimiento con fecha de entrega. */
  requirementId: string | null;
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

/* -------------------------------- Filtros --------------------------------- */

// Valores que no son ni un id ni un estado real, y por eso no pueden chocar
// con uno: las tareas huérfanas y "todo lo que no está cerrado".
const SIN_RESPONSABLE = "__sin__";
const PENDIENTES = "__pendientes__";

/** " · 3" al lado del nombre, o nada si no le queda ninguna. */
function cuentaTexto(n: number | undefined) {
  return n ? ` · ${n}` : "";
}

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

/**
 * Un círculo con las iniciales, como el avatar de Notion.
 *
 * El color sale del nombre y siempre es el mismo para la misma persona: con
 * seis personas en el tablero, al segundo día ya se reconoce a cada una por el
 * color, sin leer.
 */
const TONOS = [
  "bg-[#E8F3EE] text-[#1F7A4D]",
  "bg-[#EEF1FB] text-[#3A4FA3]",
  "bg-[#FBF1E6] text-[#9A5B13]",
  "bg-[#F6ECF6] text-[#8A3A87]",
  "bg-[#EAF4F6] text-[#1D6B78]",
  "bg-[#F9ECEC] text-[#A23B3B]",
];
function Iniciales({ nombre }: { nombre: string }) {
  const limpio = nombre.trim();
  if (!limpio) {
    return <span className="inline-block h-5 w-5 shrink-0 rounded-full border border-dashed border-border" aria-hidden />;
  }
  const partes = limpio.split(/\s+/);
  const letras = ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
  let h = 0;
  for (const c of limpio) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${TONOS[h % TONOS.length]}`}
      aria-hidden
    >
      {letras}
    </span>
  );
}

/* -------------------------------- La pantalla ----------------------------- */

export default function TableroNotion({
  canManage,
  currentUserId,
  users,
  desde,
  hasta,
  periodoElegido = false,
  products,
}: {
  canManage: boolean;
  currentUserId: string;
  users: UserOption[];
  /** El período elegido arriba, común a todas las pestañas de Contenido. */
  desde: string;
  hasta: string;
  /**
   * Si el período lo eligió una persona o es el que viene por defecto.
   *
   * Sin elegir, esta pantalla abre solo con HOY: los días anteriores seguían
   * ahí plegados y se leían como si fueran de hoy ("sigue apareciendo lo del
   * viernes", Emilia, 21 de septiembre). Pero cuando alguien pide "este mes"
   * a propósito, esconderle el mes sería no contestarle.
   */
  periodoElegido?: boolean;
  products: ProductOption[];
}) {
  const [tareas, setTareas] = useState<TareaFila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // Quién: "" son todas, SIN_RESPONSABLE son las huérfanas, y si no, un id.
  const [persona, setPersona] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [creandoEn, setCreandoEn] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  // El día a día es EL día: abre solo con hoy. Los días anteriores seguían
  // en la pantalla —plegados, pero ahí— y se leían como si fueran de hoy
  // ("sigue apareciendo lo del viernes", Emilia, 21 de septiembre). La
  // historia queda a un clic, y con un filtro puesto se ve entera.
  const [verAnteriores, setVerAnteriores] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/contenido/tareas?desde=${desde}&hasta=${hasta}`)
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
      if (persona === SIN_RESPONSABLE) {
        if (x.ownerId) return false;
      } else if (persona && x.ownerId !== persona) {
        return false;
      }
      if (estadoFiltro === PENDIENTES) {
        if (x.estado === "HECHO") return false;
      } else if (estadoFiltro && x.estado !== estadoFiltro) {
        return false;
      }
      if (!t) return true;
      return (
        (x.product?.name ?? x.productoTexto ?? "").toLowerCase().includes(t) ||
        (x.owner?.name ?? x.responsableTexto ?? "").toLowerCase().includes(t) ||
        (x.notas ?? "").toLowerCase().includes(t)
      );
    });
  }, [tareas, busqueda, persona, estadoFiltro]);

  /**
   * Cuántas le quedan sin cerrar a cada quien, en todo lo cargado.
   *
   * Va al lado del nombre en el desplegable. Es la diferencia entre elegir a
   * ciegas —abrir persona por persona hasta encontrar quién está atrasado— y
   * ver de una quién necesita que le escriban.
   */
  const pendientesPorPersona = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const t of tareas ?? []) {
      if (t.estado === "HECHO") continue;
      const clave = t.ownerId ?? SIN_RESPONSABLE;
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
    }
    return cuenta;
  }, [tareas]);

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
  const hayFiltro = Boolean(persona || estadoFiltro || busqueda.trim());
  const soloHoy = !verAnteriores && !hayFiltro && !periodoElegido;
  const diasVisibles = soloHoy ? dias.filter(([d]) => d === hoy) : dias;
  const diasAnteriores = dias.filter(([d]) => d !== hoy).length;

  /**
   * Qué días arrancan abiertos.
   *
   * Solo hoy y ayer. Con noventa días de historia importada, abrir todo dejaría
   * mil filas en pantalla y el día de trabajo enterrado abajo del todo.
   */
  const estaAbierto = (dia: string) =>
    abiertos[dia] ??
    (dia === hoy ||
      dias.findIndex(([d]) => d === dia) === 0 ||
      // Con un filtro puesto la historia ya quedó recortada, y dejar los días
      // plegados obliga a abrirlos uno por uno para ver lo que se buscaba.
      // Arriba de cien filas se vuelve a plegar: ahí el problema es otro.
      (hayFiltro && visibles.length <= 100));

  const opcionesEstado = ESTADOS_TAREA.map((e) => ({ valor: e, texto: ESTADO_TAREA_LABEL[e] }));
  const opcionesPlataforma = PLATAFORMAS.map((p) => ({ valor: p, texto: PLATAFORMA_LABEL[p] }));
  const opcionesResponsable = users.map((u) => ({ valor: u.id, texto: u.name }));
  const opcionesProducto = products.map((p) => ({ id: p.id, nombre: p.name, codigo: p.code }));

  const claseCampo =
    "rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-border-strong focus:outline-none";

  const etiquetaPersona =
    persona === SIN_RESPONSABLE
      ? "sin responsable"
      : persona === currentUserId
        ? "las mías"
        : persona
          ? (users.find((u) => u.id === persona)?.name ?? "")
          : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Contenido del día</h2>
          <p className="mt-0.5 text-xs text-muted">
            Igual que en Notion: haz clic en cualquier celda y escribe. Se guarda solo.
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
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className={claseCampo}
            aria-label="Filtrar por responsable"
          >
            <option value="">Todo el equipo</option>
            <option value={currentUserId}>
              Solo las mías{cuentaTexto(pendientesPorPersona.get(currentUserId))}
            </option>
            <optgroup label="Por persona">
              {users
                .filter((u) => u.id !== currentUserId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {cuentaTexto(pendientesPorPersona.get(u.id))}
                  </option>
                ))}
            </optgroup>
            <option value={SIN_RESPONSABLE}>
              Sin responsable{cuentaTexto(pendientesPorPersona.get(SIN_RESPONSABLE))}
            </option>
          </select>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className={claseCampo}
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            <option value={PENDIENTES}>Sin cerrar</option>
            <optgroup label="Un estado">
              {ESTADOS_TAREA.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_TAREA_LABEL[e]}
                </option>
              ))}
            </optgroup>
          </select>
          {(persona || estadoFiltro || busqueda) && (
            <button
              type="button"
              onClick={() => {
                setPersona("");
                setEstadoFiltro("");
                setBusqueda("");
              }}
              className="rounded px-2 py-1 text-xs text-muted underline-offset-2 transition hover:text-foreground hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {hayFiltro && (
        <p className="text-xs text-muted">
          {visibles.length === 0
            ? "Ninguna tarea coincide."
            : `${visibles.length} ${visibles.length === 1 ? "tarea" : "tareas"} ${
                visibles.length === 1 ? "coincide" : "coinciden"
              } con el filtro${etiquetaPersona ? ` · ${etiquetaPersona}` : ""}.`}
        </p>
      )}

      {error && (
        <p className="rounded border border-critical bg-critical-bg px-3 py-2 text-xs text-critical">
          {error}
        </p>
      )}

      {tareas === null ? (
        <p className="text-sm text-muted">Cargando el tablero…</p>
      ) : diasVisibles.length === 0 ? (
        <div className="rounded border border-border bg-surface p-6 text-sm text-muted">
          {hayFiltro
            ? "Ninguna tarea coincide con el filtro."
            : soloHoy
              ? "Todavía no hay tareas cargadas para hoy."
              : "Todavía no hay tareas cargadas."}
        </div>
      ) : (
        diasVisibles.map(([dia, filas]) => {
          const abierto = estaAbierto(dia);
          const hechas = filas.filter((f) => f.estado === "HECHO").length;
          const pendientesDia = filas.length - hechas;
          // Quién dejó qué sin cerrar ese día: es la pregunta de Emilia
          // —"¿cuántos pendientes dejan los chicos?"— y se contesta en la
          // misma línea del día, sin abrirlo.
          const pendientesPorQuien = new Map<string, number>();
          for (const f of filas) {
            if (f.estado === "HECHO") continue;
            const quien = f.owner?.name.split(" ")[0] ?? f.responsableTexto ?? "Sin responsable";
            pendientesPorQuien.set(quien, (pendientesPorQuien.get(quien) ?? 0) + 1);
          }
          const avance = filas.length ? hechas / filas.length : 0;
          return (
            <section key={dia} className="overflow-hidden rounded-xl border border-border bg-surface">
              <button
                type="button"
                onClick={() => setAbiertos((a) => ({ ...a, [dia]: !abierto }))}
                aria-expanded={abierto}
                className="relative flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition hover:bg-surface-2/60"
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
                <span className="text-sm font-semibold">{tituloDelDia(dia)}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                    {filas.length} {filas.length === 1 ? "tarea" : "tareas"}
                  </span>
                  {hechas > 0 && (
                    <span className="rounded-full bg-good-bg px-2 py-0.5 text-good">
                      {hechas} {hechas === 1 ? "lista" : "listas"}
                    </span>
                  )}
                  {pendientesDia > 0 && (
                    <span className="rounded-full bg-pending-bg px-2 py-0.5 text-warning">
                      {pendientesDia} {pendientesDia === 1 ? "pendiente" : "pendientes"}
                    </span>
                  )}
                </span>
                {pendientesDia > 0 && (
                  <span className="ml-auto text-[11px] text-muted">
                    {[...pendientesPorQuien.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([q, n]) => `${q} ${n}`)
                      .join(" · ")}
                  </span>
                )}
                {/* El avance del día como una línea al pie del encabezado: se lee
                    de un vistazo sin agregar otra fila de números. */}
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-2" aria-hidden>
                  <span className="block h-full bg-accent/70" style={{ width: `${avance * 100}%` }} />
                </span>
              </button>

              {abierto && (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-2/30 text-left text-[11px] text-muted">
                        <th className="px-3 py-2 font-medium">Producto</th>
                        <th className="px-3 py-2 font-medium">Responsable</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium">Plataforma</th>
                        <th className="w-16 px-3 py-2 text-right font-medium">Nº</th>
                        <th className="px-3 py-2 font-medium">Pautado / notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((t) => {
                        // Un editor mueve lo suyo; la dirección mueve todo. Es
                        // la misma regla que ya aplica el servidor: repetirla
                        // acá evita que alguien escriba algo que va a rebotar.
                        const mia = t.ownerId === currentUserId;
                        const puedo = canManage || mia;
                        // Las filas que vienen de un requerimiento toman de
                        // ahí el producto y el responsable. Dejarlos editables
                        // acá sería una trampa: el cambio se vería, y volvería
                        // solo la próxima vez que alguien tocara la pieza.
                        const deRequerimiento = Boolean(t.requirementId);
                        return (
                          <tr
                            key={t.id}
                            className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-2/60"
                          >
                            <td className={CELDA}>
                              {canManage && !deRequerimiento ? (
                                <BuscadorProducto
                                  opciones={opcionesProducto}
                                  valor={t.productId ?? ""}
                                  onElegir={(v) => {
                                    if (v !== (t.productId ?? "")) editar(t.id, "productId", v || null);
                                  }}
                                  vacio={t.productoTexto ?? "Sin producto"}
                                  ariaLabel="Producto"
                                  className="min-w-[170px]"
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
                              {deRequerimiento && (
                                <a
                                  href="/dashboard/contenido?vista=requerimientos"
                                  className="mt-0.5 inline-block text-[11px] text-accent-strong underline-offset-2 hover:underline"
                                >
                                  Viene de un requerimiento
                                </a>
                              )}
                            </td>
                            <td className={CELDA}>
                              <span className="flex items-center gap-2">
                                <Iniciales nombre={t.owner?.name ?? t.responsableTexto ?? ""} />
                                <CeldaSelect
                                  valor={t.ownerId ?? ""}
                                  opciones={opcionesResponsable}
                                  onGuardar={(v) => editar(t.id, "ownerId", v || null)}
                                  editable={canManage && !deRequerimiento}
                                  vacio={t.responsableTexto ?? "Sin asignar"}
                                />
                              </span>
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
                                placeholder="Escribe aquí"
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
      {!hayFiltro && diasAnteriores > 0 && (
        <button
          type="button"
          onClick={() => setVerAnteriores((v) => !v)}
          className="self-start rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-border-strong hover:text-foreground"
        >
          {verAnteriores ? "Ver solo hoy" : `Ver días anteriores (${diasAnteriores})`}
        </button>
      )}
    </div>
  );
}
