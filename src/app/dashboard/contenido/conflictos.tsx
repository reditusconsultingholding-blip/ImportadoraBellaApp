"use client";

import { useState } from "react";

/**
 * Los choques entre PRODUCTOS ORDEN y Jarvis, para que dirección decida.
 *
 * Cada tarjeta cuenta QUÉ DICE CADA LADO antes de ofrecer los botones. Un aviso
 * que solo dice "hay un conflicto" obliga a ir a mirar Notion en otra pestaña, y
 * el que tenía que decidir termina postergándolo.
 */

export type Conflicto = {
  id: string;
  tipo: "sobra_en_jarvis" | "sin_cruzar";
  producto: string;
  /** La persona de Jarvis en disputa, cuando la hay. */
  persona: string | null;
  /** El texto crudo de Notion, cuando no corresponde a nadie. */
  nombreEnNotion: string | null;
  /** Quién figura hoy en Notion para ese producto, para poder comparar. */
  segunNotion: string[];
  desde: string;
};

export type Asignable = { id: string; name: string };

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "long" });

export default function Conflictos({
  inicial,
  asignables,
}: {
  inicial: Conflicto[];
  asignables: Asignable[];
}) {
  const [pendientes, setPendientes] = useState(inicial);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decidir(id: string, decision: string, userId?: string) {
    if (trabajando) return;
    setTrabajando(id);
    setError(null);
    try {
      const res = await fetch(`/api/contenido/conflictos/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, userId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      setPendientes((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(null);
    }
  }

  if (pendientes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-foreground">
          Notion y Jarvis dicen lo mismo.
        </p>
        <p className="mt-1 text-sm text-muted">
          Cuando no coincidan en quién lleva un producto, aparece acá y te llega un aviso. Mientras
          tanto no se toca nada: nadie pierde el acceso por una sincronización.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {pendientes.length === 1
          ? "Hay un producto donde Notion y Jarvis no coinciden."
          : `Hay ${pendientes.length} productos donde Notion y Jarvis no coinciden.`}{" "}
        Hasta que decidas, queda como está en Jarvis.
      </p>

      {error && (
        <p className="rounded-lg border border-critical/50 bg-critical-bg/60 px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {pendientes.map((c) => (
        <div key={c.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-foreground">{c.producto}</p>
            <p className="text-[11px] text-muted">desde el {fecha(c.desde)}</p>
          </div>

          {c.tipo === "sobra_en_jarvis" ? (
            <>
              <p className="text-sm">
                En Jarvis <span className="font-medium text-foreground">{c.persona}</span> lleva este
                producto, puesto a mano. En PRODUCTOS ORDEN{" "}
                {c.segunNotion.length > 0 ? (
                  <>
                    figura{c.segunNotion.length > 1 ? "n" : ""}{" "}
                    <span className="font-medium text-foreground">{c.segunNotion.join(", ")}</span>
                  </>
                ) : (
                  "no figura nadie"
                )}
                .
              </p>
              <p className="mt-1 text-xs text-muted">
                Si lo dejas, {c.persona} sigue viendo y editando todas las piezas de {c.producto}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Boton
                  onClick={() => decidir(c.id, "dejar")}
                  ocupado={trabajando === c.id}
                  principal
                >
                  Dejar a {c.persona}
                </Boton>
                <Boton onClick={() => decidir(c.id, "quitar")} ocupado={trabajando === c.id}>
                  Quitarle el producto
                </Boton>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">
                En PRODUCTOS ORDEN este producto está a nombre de{" "}
                <span className="font-medium text-foreground">{c.nombreEnNotion}</span>, y en Jarvis
                no hay nadie con ese nombre.
              </p>
              <p className="mt-1 text-xs text-muted">
                Por eso el producto quedó sin responsable. Lo de fondo se arregla escribiendo en
                Notion el nombre tal como está en Jarvis; acá podés destrabarlo mientras tanto.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && decidir(c.id, "asignar", e.target.value)}
                  disabled={trabajando === c.id}
                  className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:border-accent disabled:opacity-50"
                >
                  <option value="">Es…</option>
                  {asignables.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <Boton onClick={() => decidir(c.id, "ignorar")} ocupado={trabajando === c.id}>
                  No es nadie, ignorar
                </Boton>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Boton({
  onClick,
  ocupado,
  principal,
  children,
}: {
  onClick: () => void;
  ocupado: boolean;
  principal?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
        principal
          ? "bg-accent text-white hover:bg-accent-strong"
          : "border border-border hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
