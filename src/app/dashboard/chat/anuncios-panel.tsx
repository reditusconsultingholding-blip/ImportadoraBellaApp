"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_CUERPO, MAX_TITULO, revisarAnuncio, type AnuncioVista } from "@/lib/anuncios-datos";
import { fechaHoraEc } from "./dias";

// El apartado del chat donde dirección publica anuncios para todo el equipo, y
// donde cualquiera puede volver a leer los que ya salieron.
//
// El anuncio en sí aparece encima de la app al entrar (ver
// `src/app/dashboard/anuncios-globales.tsx`). Acá está la otra mitad: escribirlo
// y, sobre todo, ver quién lo acusó. Eso último es lo que convierte "lo mandé
// al grupo" en "sé quién se enteró".

export default function AnunciosPanel({ yoPuedoPublicar }: { yoPuedoPublicar: boolean }) {
  const [anuncios, setAnuncios] = useState<AnuncioVista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(() => {
    fetch("/api/chat/anuncios")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { anuncios?: AnuncioVista[] } | null) => {
        if (data?.anuncios) setAnuncios(data.anuncios);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;

    // El mismo chequeo que hace la ruta. Acá es para no mandar un pedido que ya
    // se sabe que va a rebotar; el que decide es el del servidor.
    const problema = revisarAnuncio(titulo, cuerpo);
    if (problema) {
      setError(problema);
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/anuncios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, cuerpo }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo publicar el anuncio.");
        return;
      }
      setTitulo("");
      setCuerpo("");
      setAbierto(false);
      cargar();
    } catch {
      setError("No se pudo publicar el anuncio. Revisa la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  async function retirar(anuncio: AnuncioVista) {
    if (
      !confirm(
        `¿Retirar "${anuncio.titulo}"?\n\nDeja de aparecerle a quien todavía no lo vio. Se conserva quién ya lo había visto.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/chat/anuncios?id=${encodeURIComponent(anuncio.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "No se pudo retirar el anuncio.");
        return;
      }
      cargar();
    } catch {
      setError("No se pudo retirar el anuncio. Revisa la conexión.");
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Anuncios al equipo</p>
          <p className="mt-0.5 text-xs text-muted">
            Le aparece a todo el equipo al entrar a la app y no se va hasta que cada persona lo
            marca como visto.
          </p>
        </div>
        {yoPuedoPublicar && (
          <button
            onClick={() => setAbierto((v) => !v)}
            className="shrink-0 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
          >
            {abierto ? "Cancelar" : "Escribir anuncio"}
          </button>
        )}
      </div>

      {abierto && yoPuedoPublicar && (
        <form
          onSubmit={publicar}
          className="flex flex-col gap-2 rounded border border-border bg-surface-2/50 p-3"
        >
          <input
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={MAX_TITULO}
            placeholder="Título del anuncio"
            className="w-full rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            maxLength={MAX_CUERPO}
            rows={5}
            placeholder="Qué tiene que saber el equipo"
            className="w-full resize-y rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">
              {cuerpo.length}/{MAX_CUERPO}
            </span>
            <button
              type="submit"
              disabled={enviando}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
            >
              {enviando ? "Publicando…" : "Publicar para todos"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="py-6 text-center text-sm text-muted">Cargando anuncios…</p>
      ) : anuncios.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Todavía no se publicó ningún anuncio.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {anuncios.map((a) => (
            <li
              key={a.id}
              className={`rounded border px-3 py-2.5 ${
                a.archivado ? "border-border bg-surface-2/40 opacity-70" : "border-border bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium">{a.titulo}</p>
                <div className="flex shrink-0 items-center gap-2">
                  {/* "3 de 8" y no un "3" suelto: el número solo no dice si
                      falta una persona o falta medio equipo. */}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      a.vistoPor >= a.destinatarios
                        ? "bg-good-bg text-good"
                        : "bg-surface-2 text-muted"
                    }`}
                    title="Cuántas personas del equipo lo marcaron como visto"
                  >
                    {a.vistoPor} de {a.destinatarios} lo vieron
                  </span>
                  {yoPuedoPublicar && !a.archivado && (
                    <button
                      onClick={() => retirar(a)}
                      title="Retirar el anuncio"
                      className="rounded px-1.5 py-0.5 text-[10px] text-muted transition hover:text-critical"
                    >
                      Retirar
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {a.cuerpo}
              </p>

              <p className="mt-2 text-[11px] text-muted">
                {a.autor.name} · {fechaHoraEc(a.createdAt)}
                {a.archivado && " · retirado"}
                {!a.visto && !a.archivado && " · todavía no lo marcaste como visto"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
