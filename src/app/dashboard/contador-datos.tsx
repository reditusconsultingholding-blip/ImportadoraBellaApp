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
    // SE ABRE AL PASAR EL CURSOR, NO SOLO AL APRETAR.
    //
    // Pedido de Sebastián: «esta notificación al pararse sobre este». Es
    // información de consulta —de cuándo son los datos— no una acción: pedir
    // un clic para leer algo que se mira de reojo es una fricción que hace que
    // nadie lo mire. El clic se conserva para dejarla fija mientras se lee, y
    // para el teclado, donde no hay cursor que parar.
    <div
      className="relative hidden md:block"
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
    >
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        onFocus={() => setAbierto(true)}
        aria-expanded={abierto}
        className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] text-muted shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition hover:border-accent hover:text-foreground"
        title="De cuándo son los datos de Meta y TikTok"
      >
        {/* El punto que late: dice que el reloj está corriendo. Es la misma
            señal que usa «En vivo» al lado, así que no es un código nuevo que
            haya que aprender. */}
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="icono-pulso absolute -inset-1 rounded-full border border-accent" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        {texto}
      </button>
      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] overflow-hidden rounded-lg border border-white/10 bg-brand-navy text-xs shadow-[0_12px_32px_rgb(0_0_0/0.3)]">
          {/* La rejilla del fondo, la misma del arranque del día. Esta tarjeta
              habla de relojes y de intervalos: que se vea como un instrumento y
              no como un globo de ayuda es parte de lo que dice. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(rgb(0 164 124 / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(0 164 124 / 0.5) 1px, transparent 1px)",
              backgroundSize: "26px 26px",
              maskImage: "radial-gradient(80% 70% at 70% 0%, #000 0%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(80% 70% at 70% 0%, #000 0%, transparent 70%)",
            }}
          />
          <div className="relative p-3.5">
            {datos.map((d) => {
              const proxima = d.proxima ? new Date(d.proxima).getTime() : null;
              const faltaMs = proxima ? proxima - ahora : null;
              // Cuánto del intervalo ya transcurrió. Es el dato que convierte
              // «próxima en 33 minutos» en algo que se mira de un vistazo.
              const total = d.intervaloMin * 60_000;
              const avance =
                faltaMs != null && faltaMs > 0
                  ? Math.min(100, Math.max(0, ((total - faltaMs) / total) * 100))
                  : 100;
              const alDia = faltaMs != null && faltaMs > 0;
              return (
                <div key={d.conector} className="mb-3.5 last:mb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[12px] font-semibold text-white">{d.nombre}</p>
                    <p className="font-mono text-[11px] text-brand-green">
                      {alDia ? faltan(faltaMs!) : "ahora"}
                    </p>
                  </div>
                  {/* EL RIEL DEL INTERVALO: LLENO ES "YA TOCA".
                      //
                      // El primer intento usaba blanco al 10 % de fondo y el
                      // verde de marca de relleno. Sobre este navy los dos
                      // tienen casi el mismo brillo, así que el riel se leía
                      // como una línea continua de punta a punta: con el 10 %
                      // recorrido se veía igual que con el 90 %. Lo vi
                      // mirándolo de cerca, no midiéndolo — el porcentaje
                      // estaba bien desde el principio.
                      //
                      // Ahora el fondo es verde muy apagado y el relleno es el
                      // verde claro que la app ya usa sobre fondos oscuros, con
                      // un cabezal brillante en la punta: el ojo va al cabezal
                      // y sabe en qué parte del intervalo está sin leer nada. */}
                  <div className="relative mt-1.5 h-[3px] overflow-hidden rounded-full bg-brand-green/15">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${avance}%`, backgroundColor: "var(--good-claro)" }}
                    />
                    {avance > 2 && avance < 99 && (
                      <span
                        aria-hidden
                        className="absolute top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_6px_var(--good-claro)]"
                        style={{ left: `${avance}%`, backgroundColor: "var(--good-claro)" }}
                      />
                    )}
                  </div>
                  <p className="mt-1.5 font-mono text-[10.5px] text-white/55">
                    {d.datosDe
                      ? `últimos datos · ${hora(d.datosDe)}`
                      : "todavía sin datos nuevos desde el último despliegue"}
                  </p>
                  <p className="font-mono text-[10.5px] text-white/40">
                    cada {d.intervaloMin >= 60 ? `${d.intervaloMin / 60} h` : `${d.intervaloMin} min`}
                    {d.consultado ? ` · consultado ${hora(d.consultado)}` : ""}
                  </p>
                  {!alDia && proxima && (
                    <p className="mt-1 text-[10.5px] text-white/55">
                      {ahora - proxima > total
                        ? "Windsor sigue trayendo los mismos números: no hubo movimiento."
                        : "Windsor ya debería traer datos nuevos: llegan en la próxima consulta."}
                    </p>
                  )}
                </div>
              );
            })}
            <p className="mt-3 border-t border-white/10 pt-2.5 text-[10px] leading-relaxed text-white/45">
              Jarvis le pregunta a Windsor cada 2 minutos. Los números nuevos aparecen cuando Windsor los trae de
              Meta y TikTok, según el intervalo de tu plan.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
