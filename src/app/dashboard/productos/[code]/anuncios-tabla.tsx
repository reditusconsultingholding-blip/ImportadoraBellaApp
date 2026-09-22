"use client";

import { useEffect, useState } from "react";

// Los anuncios de una campaña, o los mejores del producto.
//
// Se piden al abrir, no con la ficha: un producto con cuarenta campañas tiene
// cientos de anuncios, y lo que se mira casi siempre es una sola campaña.

export type Anuncio = {
  id: string;
  nombre: string;
  grupo: string | null;
  angulo: string | null;
  formato: string | null;
  anguloDesde: "anuncio" | "conjunto" | "campana" | null;
  miniaturaUrl: string | null;
  campana: string;
  plataforma: "META" | "TIKTOK";
  gasto: number | null;
  compras: number;
  cpa: number | null;
  ctr: number | null;
  cpm: number | null;
  roas: number | null;
  diasActivo: number;
  ultimoDia: string | null;
  veredicto: "escalar" | "bien" | "mirar" | "apagar" | "poco dato";
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-EC", { style: "currency", currency: "USD" });

const VEREDICTO: Record<Anuncio["veredicto"], { texto: string; clase: string; ayuda: string }> = {
  escalar: { texto: "Escalar", clase: "bg-good-bg text-good", ayuda: "CPA al menos 20% por debajo del objetivo, con 3 compras o más" },
  bien: { texto: "Bien", clase: "bg-good-bg text-accent-strong", ayuda: "dentro del CPA objetivo" },
  mirar: { texto: "Mirar", clase: "bg-pending-bg text-warning", ayuda: "hasta 30% por encima del objetivo" },
  apagar: { texto: "Apagar", clase: "bg-critical-bg text-critical", ayuda: "muy por encima del objetivo, o gastó sin vender" },
  "poco dato": { texto: "Poco dato", clase: "bg-surface-2 text-muted", ayuda: "menos de 3 compras: todavía no dice nada" },
};

export default function AnunciosTabla({
  code,
  periodo,
  campana,
  limite,
  mostrarCampana,
}: {
  code: string;
  periodo: string;
  /** Si viene, solo los anuncios de esa campaña. */
  campana?: string;
  /** Cuántos mostrar (los mejores primero). */
  limite?: number;
  mostrarCampana?: boolean;
}) {
  const [datos, setDatos] = useState<{ anuncios: Anuncio[]; verCifras: boolean; sinDatos: boolean; cpaObjetivo: number | null } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams({ periodo, ...(campana ? { campana } : {}) });
    fetch(`/api/productos/${encodeURIComponent(code)}/anuncios?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [code, periodo, campana]);

  if (error) return <p className="px-3 py-3 text-xs text-critical">No se pudieron cargar los anuncios.</p>;
  if (!datos) return <p className="px-3 py-3 text-xs text-muted">Cargando anuncios…</p>;
  if (datos.anuncios.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-muted">
        {datos.sinDatos
          ? "Todavía no llegaron los anuncios de esta campaña. Se traen de Meta y TikTok cada 30 minutos."
          : "Ningún anuncio gastó en este período."}
      </p>
    );
  }

  const lista = limite ? datos.anuncios.slice(0, limite) : datos.anuncios;
  const cifras = datos.verCifras;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
            <th className="px-2.5 py-1.5">Anuncio</th>
            {/* Lo que el equipo quiere medir de verdad: no qué creativo
                anduvo, sino QUÉ ÁNGULO anduvo. "Hemos testeado seis ángulos y
                los que funcionan son dos." */}
            <th className="px-2.5 py-1.5">Ángulo / formato</th>
            {mostrarCampana && <th className="px-2.5 py-1.5">Campaña</th>}
            <th className="px-2.5 py-1.5 text-right">Compras</th>
            {cifras && <th className="px-2.5 py-1.5 text-right">Gasto</th>}
            {cifras && <th className="px-2.5 py-1.5 text-right">CPA</th>}
            <th className="px-2.5 py-1.5 text-right">CTR</th>
            {cifras && <th className="px-2.5 py-1.5 text-right">CPM</th>}
            {cifras && <th className="px-2.5 py-1.5 text-right">ROAS</th>}
            <th className="px-2.5 py-1.5">Veredicto</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((a) => {
            const v = VEREDICTO[a.veredicto];
            return (
              <tr key={a.id} className="border-b border-border/60 last:border-b-0 align-middle">
                <td className="px-2.5 py-1.5">
                  <div className="flex items-center gap-2">
                    {a.miniaturaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura remota de Meta/TikTok
                      <img
                        src={a.miniaturaUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-2 text-[9px] text-muted">
                        {a.plataforma === "META" ? "Meta" : "TikTok"}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block max-w-[260px] truncate font-medium text-foreground" title={a.nombre}>
                        {a.nombre}
                      </span>
                      <span className="block truncate text-[10px] text-muted">
                        {[a.grupo, `${a.diasActivo} ${a.diasActivo === 1 ? "día" : "días"} con gasto`, a.ultimoDia ? `último ${a.ultimoDia.slice(5)}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </div>
                </td>
                {/* La categoría sale del nombre —del conjunto de anuncios,
                    que es donde el equipo pone el ángulo, o del anuncio o la
                    campaña—. Cuando el nombre no dice nada se muestra "sin
                    clasificar" y no se inventa: un ángulo inventado contamina
                    justo la respuesta que se está buscando. */}
                <td className="px-2.5 py-1.5">
                  {a.angulo || a.formato ? (
                    <span className="flex flex-wrap items-center gap-1">
                      {a.angulo && (
                        <span
                          title={
                            a.anguloDesde === "conjunto"
                              ? "Del nombre del conjunto de anuncios"
                              : a.anguloDesde === "anuncio"
                                ? "Del nombre del anuncio"
                                : "Del nombre de la campaña"
                          }
                          className="rounded-full border border-accent/40 bg-good-bg px-1.5 py-px text-[10px] font-medium text-accent-strong"
                        >
                          {a.angulo}
                        </span>
                      )}
                      {a.formato && (
                        <span className="rounded-full border border-border bg-surface-2 px-1.5 py-px text-[10px] text-muted">
                          {a.formato}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span
                      className="text-[10px] text-muted"
                      title="El nombre de la campaña, del conjunto y del anuncio no dicen el ángulo. Poniéndolo en el nombre, esta columna se llena sola."
                    >
                      sin clasificar
                    </span>
                  )}
                </td>
                {mostrarCampana && (
                  <td className="max-w-[180px] truncate px-2.5 py-1.5 text-muted" title={a.campana}>
                    {a.campana}
                  </td>
                )}
                <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">{a.compras}</td>
                {cifras && <td className="px-2.5 py-1.5 text-right tabular-nums text-muted">{money(a.gasto)}</td>}
                {cifras && <td className="px-2.5 py-1.5 text-right font-medium tabular-nums">{money(a.cpa)}</td>}
                <td className="px-2.5 py-1.5 text-right tabular-nums text-muted">
                  {a.ctr != null ? `${(a.ctr * 100).toFixed(2)}%` : "—"}
                </td>
                {cifras && <td className="px-2.5 py-1.5 text-right tabular-nums text-muted">{money(a.cpm)}</td>}
                {cifras && (
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-muted">{a.roas != null ? a.roas.toFixed(2) : "—"}</td>
                )}
                <td className="px-2.5 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${v.clase}`} title={v.ayuda}>
                    {v.texto}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {cifras && datos.cpaObjetivo != null && (
        <p className="px-2.5 py-1.5 text-[10px] text-muted">
          El veredicto compara el CPA de cada anuncio contra el CPA objetivo del producto ({money(datos.cpaObjetivo)}),
          y pide al menos 3 compras antes de opinar.
        </p>
      )}
    </div>
  );
}
