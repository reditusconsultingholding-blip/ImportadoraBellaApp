"use client";

// De dónde salen los pedidos que está mostrando el control, y de cuándo son.
//
// Emilia revisa este número contra su planilla producto por producto. Si el
// control dice 104 y ella ve 104, la pregunta que sigue es "¿de cuándo es
// esto?" — y antes no había forma de saberlo: los pedidos entraban de Shopify
// sin decirlo, y la planilla del equipo ni se leía.
//
// Acá se dice las tres cosas: que salen de su planilla, cuántos días de este
// período cubre, y hace cuánto se miró. Con el botón para traerla ahora mismo
// cuando alguien acaba de cargar pedidos y no quiere esperar la hora.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Estado = {
  dias: number;
  pedidos: number;
  ultimoDia: string | null;
  /** Cuándo se miró la planilla por última vez, en ISO. */
  miradaAl: string | null;
  detalle: string | null;
  diasDelPeriodo: number;
  /** Pedidos de la planilla que todavía no caen en ningún producto. */
  sinProducto: number;
  nombresSinProducto: number;
};

function haceCuanto(iso: string) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

export default function OrigenPedidos({ desde, hasta }: { desde: string; hasta: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [trayendo, setTrayendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/control/reporte?desde=${desde}&hasta=${hasta}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo consultar."))))
      .then((j) => vivo && setEstado(j as Estado))
      .catch(() => vivo && setEstado(null));
    return () => {
      vivo = false;
    };
  }, [desde, hasta]);

  async function traerAhora() {
    setTrayendo(true);
    setError(null);
    try {
      const res = await fetch("/api/control/reporte", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "No se pudo traer la planilla.");
      setEstado((e) => (e ? { ...e, miradaAl: new Date().toISOString(), detalle: j.detalle ?? null } : e));
      // Los cierres se rehacen del lado del servidor: hay que volver a pedir
      // la pantalla para ver los números nuevos.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo traer la planilla.");
    } finally {
      setTrayendo(false);
    }
  }

  const conPlanilla = (estado?.dias ?? 0) > 0;
  const completo = estado != null && estado.dias >= estado.diasDelPeriodo;

  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-border bg-surface px-4 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
        Pedidos
      </span>

      <p className="min-w-[16rem] flex-1 text-xs text-muted">
        {estado === null ? (
          "Consultando de dónde salen los pedidos…"
        ) : conPlanilla ? (
          <>
            Salen de{" "}
            <strong className="font-medium text-foreground">
              la planilla del equipo de ventas
            </strong>
            : {estado.pedidos.toLocaleString("es-EC")} pedidos en {estado.dias}{" "}
            {estado.dias === 1 ? "día" : "días"} de este período
            {!completo && (
              <span className="text-warning">
                {" "}
                · los {estado.diasDelPeriodo - estado.dias} días que la planilla no cubre se
                completan con Shopify
              </span>
            )}
            {estado.miradaAl && <> · revisada {haceCuanto(estado.miradaAl)}</>}
          </>
        ) : (
          <>
            La planilla del equipo no tiene ningún día de este período cargado, así que los
            pedidos salen de Shopify. Se le acercan, pero no son el mismo número.
          </>
        )}
        {error && <span className="text-critical"> · {error}</span>}
      </p>

      <button
        type="button"
        onClick={traerAhora}
        disabled={trayendo}
        className="shrink-0 rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-50"
      >
        {trayendo ? "Trayendo…" : "Traer la planilla ahora"}
      </button>

      {/* Lo que falta enlazar, con la puerta al lado. Un pedido sin producto
          cuenta en el total pero va a la fila "sin asignar", sin ingresos ni
          costos: la utilidad del período sale más baja de lo real y no hay
          forma de adivinar por qué. */}
      {estado != null && estado.sinProducto > 0 && (
        <p className="w-full text-xs text-warning">
          {estado.sinProducto.toLocaleString("es-EC")} de esos pedidos están a nombre de{" "}
          {estado.nombresSinProducto}{" "}
          {estado.nombresSinProducto === 1 ? "producto que todavía no está enlazado" : "productos que todavía no están enlazados"}
          , así que van a &quot;sin asignar&quot; y no suman a la rentabilidad de nadie.{" "}
          <Link href="/dashboard/control?vista=enlazar" className="font-medium underline">
            Enlazarlos
          </Link>
          .
        </p>
      )}
    </section>
  );
}
