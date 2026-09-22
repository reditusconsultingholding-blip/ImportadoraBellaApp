"use client";

import { useEffect, useState } from "react";

// El contador del encabezado: de cuándo son los datos de Meta y TikTok y
// cuánto falta para la próxima actualización.
//
// "Que me aparezca el contador de cuándo va a ser la nueva actualización de
// información": Jarvis le pregunta a Windsor cada 2 minutos, pero lo nuevo
// solo llega cuando Windsor refresca (cada 15 minutos o cada hora, según el
// plan). Este contador dice exactamente eso, para no confundir "no hay datos
// nuevos todavía" con "está roto".

type Conector = {
  conector: string;
  nombre: string;
  intervaloMin: number;
  datosDe: string | null;
  proxima: string | null;
  consultado: string | null;
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" });

function faltan(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(r).padStart(2, "0")}`;
}

export default function ContadorDatos() {
  const [datos, setDatos] = useState<Conector[] | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    const traer = () =>
      fetch("/api/frescura")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => vivo && j && setDatos(j.conectores))
        .catch(() => {});
    traer();
    const cadaMinuto = setInterval(traer, 60_000);
    const cadaSegundo = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      vivo = false;
      clearInterval(cadaMinuto);
      clearInterval(cadaSegundo);
    };
  }, []);

  if (!datos) return null;

  // Lo que se muestra en la barra: el próximo de los dos que se espera.
  const proximas = datos.filter((d) => d.proxima).map((d) => new Date(d.proxima!).getTime());
  const proxima = proximas.length ? Math.min(...proximas) : null;
  const masViejo = datos.filter((d) => d.datosDe).map((d) => new Date(d.datosDe!).getTime());
  const datosDe = masViejo.length ? Math.min(...masViejo) : null;
  const vencido = proxima != null && proxima <= ahora;

  // Pasado el doble del intervalo sin novedades, no es que esté actualizando:
  // es que Windsor trae lo mismo porque no hubo movimiento (de madrugada
  // pasa siempre). Decirlo así evita que parezca que quedó colgado.
  const intervaloMs = Math.max(...datos.map((d) => d.intervaloMin)) * 60_000;
  const quieto = proxima != null && ahora - proxima > intervaloMs;
  const texto =
    proxima == null
      ? "Meta y TikTok: esperando la primera actualización"
      : quieto
        ? `Meta y TikTok: sin cambios desde las ${hora(new Date(datosDe!).toISOString())}`
        : vencido
          ? `Meta y TikTok: datos de las ${hora(new Date(datosDe!).toISOString())} · actualizando…`
          : `Meta y TikTok: datos de las ${hora(new Date(datosDe!).toISOString())} · próxima en ${faltan(proxima - ahora)}`;

  return (
    <div className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted transition hover:border-border-strong hover:text-foreground"
        title="De cuándo son los datos de Meta y TikTok"
      >
        {texto}
      </button>
      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded border border-border bg-surface p-3 text-xs shadow-lg">
          {datos.map((d) => (
            <div key={d.conector} className="mb-2 last:mb-0">
              <p className="font-semibold text-foreground">{d.nombre}</p>
              <p className="text-muted">
                {d.datosDe ? `Últimos datos nuevos: ${hora(d.datosDe)}` : "Todavía sin datos nuevos desde el último despliegue"}
              </p>
              <p className="text-muted">
                {d.proxima
                  ? new Date(d.proxima).getTime() > ahora
                    ? `Próxima actualización en ${faltan(new Date(d.proxima).getTime() - ahora)} (${hora(d.proxima)})`
                    : ahora - new Date(d.proxima).getTime() > d.intervaloMin * 60_000
                      ? "Windsor sigue trayendo los mismos números: no hubo movimiento"
                      : "Windsor ya debería traer datos nuevos: llegan en la próxima consulta"
                  : "—"}
              </p>
              <p className="text-muted">
                Windsor refresca cada {d.intervaloMin >= 60 ? `${d.intervaloMin / 60} h` : `${d.intervaloMin} min`}
                {d.consultado ? ` · Jarvis preguntó a las ${hora(d.consultado)}` : ""}
              </p>
            </div>
          ))}
          <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted">
            Jarvis le pregunta a Windsor cada 2 minutos. Los números nuevos aparecen cuando Windsor los trae de Meta y
            TikTok, según el intervalo de tu plan.
          </p>
        </div>
      )}
    </div>
  );
}
