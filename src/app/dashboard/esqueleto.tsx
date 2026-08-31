// Los bloques grises que ocupan el lugar del contenido mientras llega.
//
// No es decoración: es lo que evita que la pantalla salte cuando entran los
// datos, y lo que le dice a quien mira que hay algo en camino. Una pantalla en
// blanco y una pantalla rota se ven exactamente igual.
//
// Se dibuja con la forma aproximada de lo que viene —tarjetas arriba, tabla
// abajo— y no con un cuadro genérico, para que el ojo ya sepa dónde va a
// aparecer cada cosa.

function Bloque({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-[latir_1.4s_ease-in-out_infinite] rounded bg-surface-2 ${className}`}
    />
  );
}

export function EsqueletoTarjetas({ cuantas = 4 }: { cuantas?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: cuantas }, (_, i) => (
        <div key={i} className="rounded border border-border bg-surface p-4">
          <Bloque className="h-3 w-20" />
          <Bloque className="mt-3 h-6 w-28" />
          <Bloque className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoTabla({ filas = 8 }: { filas?: number }) {
  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="border-b border-border px-5 py-3.5">
        <Bloque className="h-4 w-44" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0">
            <Bloque className="h-4 flex-1" />
            <Bloque className="h-4 w-16" />
            <Bloque className="h-4 w-16" />
            <Bloque className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** La pantalla de carga completa: título, tarjetas y tabla. */
export default function Esqueleto({
  titulo,
  tarjetas = 4,
  filas = 8,
}: {
  titulo?: string;
  tarjetas?: number;
  filas?: number;
}) {
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite">
      {/* El texto va para quien usa lector de pantalla, que no ve el latido. */}
      <span className="sr-only">Cargando{titulo ? ` ${titulo}` : ""}…</span>
      <div>
        <Bloque className="h-5 w-40" />
        <Bloque className="mt-2 h-3 w-64" />
      </div>
      {tarjetas > 0 && <EsqueletoTarjetas cuantas={tarjetas} />}
      {filas > 0 && <EsqueletoTabla filas={filas} />}
    </div>
  );
}
