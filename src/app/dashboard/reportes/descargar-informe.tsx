"use client";

import { useState } from "react";
import { Girando } from "../navegar";

// El botón que baja el informe del período elegido.
//
// No es un `<a href>` a secas a propósito: el PDF se arma al vuelo y un
// período largo tarda varios segundos. Con un link normal no pasa nada visible
// en ese rato y se termina apretando tres veces, que es tres veces el mismo
// trabajo en el servidor. Con fetch se puede decir "generando" y desactivar el
// botón mientras tanto.
export default function DescargarInforme({
  consulta,
  nombre,
  periodo,
}: {
  /** Los parámetros del período, tal como viajan en la URL. */
  consulta: string;
  /** Cómo se va a llamar el archivo. Lo decide el servidor; acá solo se usa. */
  nombre: string;
  periodo: string;
}) {
  const [estado, setEstado] = useState<"quieto" | "generando" | "error">("quieto");

  async function descargar() {
    setEstado("generando");
    try {
      const res = await fetch(`/api/reportes/periodo?${consulta}`);
      if (!res.ok) {
        setEstado("error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setEstado("quieto");
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Descargar el informe de este período</p>
          <p className="text-xs text-muted">
            {periodo}, en PDF: facturado, pauta, utilidad estimada y qué hacer con cada producto.
          </p>
        </div>
        <button
          onClick={descargar}
          disabled={estado === "generando"}
          className="flex items-center gap-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {estado === "generando" && <Girando />}
          {estado === "generando" ? "Generando…" : "Descargar PDF"}
        </button>
      </div>

      {estado === "error" && (
        <p className="mt-2 text-xs text-critical">
          No se pudo generar el informe. Si el período es muy largo puede haberse pasado del tiempo
          máximo: prueba con un rango más corto, o vuelve a intentarlo.
        </p>
      )}
    </div>
  );
}
