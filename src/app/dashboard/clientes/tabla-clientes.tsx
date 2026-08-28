"use client";

import { useMemo, useState } from "react";

type Cliente = {
  telefono: string;
  nombre: string | null;
  email: string | null;
  provincia: string | null;
  ciudad: string | null;
  pedidos: number;
  total: number;
  primera: string;
  ultima: string;
  productos: string[];
};

const money = (n: number, dec = 0) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: dec });

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Filtro = "todos" | "repiten" | "una-vez";

export default function TablaClientes({
  clientes,
  totalClientes,
  urlCsv,
}: {
  clientes: Cliente[];
  totalClientes: number;
  urlCsv: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    return clientes.filter((c) => {
      if (filtro === "repiten" && c.pedidos < 2) return false;
      if (filtro === "una-vez" && c.pedidos !== 1) return false;
      if (!q) return true;
      return plano(
        `${c.nombre ?? ""} ${c.telefono} ${c.email ?? ""} ${c.provincia ?? ""} ${c.ciudad ?? ""}`
      ).includes(q);
    });
  }, [clientes, busqueda, filtro]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono, ciudad…"
          className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent sm:max-w-xs"
        />

        {(
          [
            { id: "todos", label: "Todos" },
            { id: "repiten", label: "Repiten" },
            { id: "una-vez", label: "Una sola compra" },
          ] as { id: Filtro; label: string }[]
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              filtro === f.id
                ? "border-accent bg-good-bg text-accent-strong"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}

        {/* La descarga es un link normal y no un fetch: así el navegador maneja
            el archivo y no hay que armarlo en memoria. */}
        <a
          href={urlCsv}
          className="ml-auto rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
        >
          Descargar CSV
        </a>
      </div>

      <p className="text-xs text-muted">
        {visibles.length} de {clientes.length} mostrados
        {totalClientes > clientes.length && (
          <> · en pantalla van los {clientes.length} que más facturan, el CSV trae los {totalClientes.toLocaleString("es-EC")}</>
        )}
      </p>

      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="table-cols w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
              <th className="px-3 py-2 font-semibold">Cliente</th>
              <th className="px-3 py-2 font-semibold">Dónde</th>
              <th className="px-3 py-2 text-right font-semibold">Pedidos</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="px-3 py-2 font-semibold">Compró</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted">
                  Ningún cliente coincide con eso.
                </td>
              </tr>
            )}

            {visibles.slice(0, 200).map((c) => (
              <tr key={c.telefono} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2.5">
                  <span className="block font-medium">{c.nombre || "Sin nombre"}</span>
                  <span className="block text-xs tabular-nums text-muted">
                    {c.telefono}
                    {c.email ? ` · ${c.email}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sm">
                  {c.ciudad || c.provincia ? (
                    <>
                      <span className="block">{c.ciudad || "—"}</span>
                      <span className="block text-xs text-muted">{c.provincia || ""}</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {c.pedidos}
                  {c.pedidos > 1 && (
                    <span className="ml-1 rounded-full border border-good/30 bg-good-bg px-1.5 py-0.5 text-[10px] font-medium text-good">
                      repite
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {money(c.total, 2)}
                </td>
                <td className="px-3 py-2.5">
                  <span className="block max-w-[18rem] truncate text-xs" title={c.productos.join(" · ")}>
                    {c.productos.slice(0, 2).join(" · ")}
                    {c.productos.length > 2 ? ` +${c.productos.length - 2}` : ""}
                  </span>
                  <span className="block text-[10px] text-muted">
                    {fecha(c.primera)}
                    {c.primera !== c.ultima ? ` — ${fecha(c.ultima)}` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
