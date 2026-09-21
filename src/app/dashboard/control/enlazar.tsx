"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { NombrePendiente } from "@/lib/enlazar-pedidos";

// Decir de qué producto es cada cosa que vende la tienda.
//
// Shopify nombra los productos a su manera —"FULL-BODY COMPRESOR VIRAL",
// "Faja Lipo 360 by Colombella"— y la pauta los nombra por código. Mientras un
// nombre no esté enlazado, sus pedidos cuentan en el total del control pero
// van a "sin producto asignado", sin ingresos: la utilidad sale más baja de lo
// que es.
//
// Cada nombre se resuelve una vez y queda para siempre, incluida la historia:
// al enlazarlo, los meses anteriores se recalculan solos. Van primero los que
// más pedidos traen, porque enlazar el que trajo dos mil en julio mueve el
// número del mes y el que trajo tres no.

type Producto = { id: string; code: string; name: string };

const entero = (n: number) => Math.round(n).toLocaleString("es-EC");
const dinero = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const normal = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Enlazar({
  pendientes,
  productos,
  desde,
  hasta,
}: {
  pendientes: NombrePendiente[];
  productos: Producto[];
  desde: string;
  hasta: string;
}) {
  const router = useRouter();
  const [hechos, setHechos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const vivos = pendientes.filter((p) => !hechos[p.nombre]);
  const totalPedidos = pendientes.reduce((a, p) => a + p.pedidos, 0);
  const resueltos = pendientes.filter((p) => hechos[p.nombre]).reduce((a, p) => a + p.pedidos, 0);

  async function resolver(nombre: string, accion: { productId: string; etiqueta: string } | { motivo: "ignorar" | "testeo" }) {
    setOcupado(nombre);
    setError(null);
    try {
      const res =
        "productId" in accion
          ? await fetch("/api/enlaces-shopify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nombre, productId: accion.productId }),
            })
          : await fetch("/api/enlaces-shopify/excluir", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nombre, motivo: accion.motivo }),
            });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      }
      setHechos((h) => ({
        ...h,
        [nombre]:
          "productId" in accion
            ? accion.etiqueta
            : accion.motivo === "testeo"
              ? "testeo"
              : "no es producto",
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
        <p className="text-sm font-medium">
          {vivos.length === 0
            ? "Todo lo vendido en el período ya tiene su producto."
            : `${entero(totalPedidos - resueltos)} pedidos de ${desde} a ${hasta} todavía no tienen producto.`}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Elige el producto de cada nombre. Si es un envío o una garantía, márcalo como «no es
          producto»; si es un producto en prueba, como «testeo» —sus ventas no se cuentan y su pauta
          sí suma como gasto—. Cada decisión vale para siempre, también para los meses anteriores:
          el control se recalcula solo en unos segundos.
        </p>
        {Object.keys(hechos).length > 0 && (
          <button
            type="button"
            onClick={() => router.push("/dashboard/control?vista=resultados")}
            className="mt-2 text-xs font-medium text-accent-strong underline-offset-2 hover:underline"
          >
            Ver cómo quedaron los resultados →
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-critical bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
      )}

      <ul className="flex flex-col gap-2">
        {pendientes.map((p) => (
          <FilaNombre
            key={p.nombre}
            p={p}
            productos={productos}
            hecho={hechos[p.nombre]}
            ocupado={ocupado === p.nombre}
            onResolver={(a) => resolver(p.nombre, a)}
          />
        ))}
      </ul>
    </div>
  );
}

function FilaNombre({
  p,
  productos,
  hecho,
  ocupado,
  onResolver,
}: {
  p: NombrePendiente;
  productos: Producto[];
  hecho: string | undefined;
  ocupado: boolean;
  onResolver: (a: { productId: string; etiqueta: string } | { motivo: "ignorar" | "testeo" }) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");
  const opciones = useMemo(() => {
    const t = normal(texto.trim());
    const lista = t ? productos.filter((x) => normal(x.name).includes(t) || x.code.includes(t)) : productos;
    return lista.slice(0, 30);
  }, [productos, texto]);

  if (hecho) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/40 px-4 py-2.5 text-xs text-muted">
        <span className="truncate">{p.nombre}</span>
        <span className="shrink-0 font-medium text-good">✓ {hecho}</span>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{p.nombre}</p>
          <p className="text-[11px] text-muted">
            {entero(p.pedidos)} pedidos · {dinero(p.facturado)} facturado
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {p.sugerido && !buscando && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onResolver({ productId: p.sugerido!.id, etiqueta: p.sugerido!.name })}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
              title="Es la sugerencia más parecida. Confirmala solo si es correcta."
            >
              Es {p.sugerido.name}
            </button>
          )}
          <button
            type="button"
            disabled={ocupado}
            onClick={() => setBuscando((b) => !b)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2 disabled:opacity-60"
          >
            {buscando ? "Cancelar" : p.sugerido ? "Otro producto…" : "Elegir producto…"}
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onResolver({ motivo: "testeo" })}
            className="rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
          >
            Testeo
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onResolver({ motivo: "ignorar" })}
            className="rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
          >
            No es producto
          </button>
        </div>
      </div>

      {buscando && (
        <div className="mt-3 rounded-lg border border-border">
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar producto por nombre o código…"
            className="w-full rounded-t-lg border-b border-border bg-background px-3 py-2 text-xs outline-none"
          />
          <ul className="max-h-52 overflow-y-auto py-1">
            {opciones.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onResolver({ productId: o.id, etiqueta: o.name })}
                  className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition hover:bg-surface-2"
                >
                  <span className="truncate">{o.name}</span>
                  <span className="shrink-0 text-[10px] text-muted">{o.code}</span>
                </button>
              </li>
            ))}
            {opciones.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted">
                Ningún producto coincide. Si no existe todavía, hay que crearlo en Productos.
              </li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
}
