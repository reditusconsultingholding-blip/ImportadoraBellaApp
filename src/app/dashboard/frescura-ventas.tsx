"use client";

import { useEffect, useState } from "react";

// De cuándo son los números de este bloque y cuánto falta para los próximos.
//
// Es la pregunta que aparece cada vez que alguien compara las ventas de la
// tienda contra lo que se atribuye la pauta: "¿esto ya está actualizado?".
// Las dos mitades se refrescan distinto y por eso se dicen las dos: Shopify
// entra cada 2 minutos, y Meta y TikTok cuando Windsor los trae (según el
// plan, cada hora o cada 15 minutos).

type Datos = {
  conectores: { nombre: string; intervaloMin: number; datosDe: string | null; proxima: string | null }[];
  ventas: { nombre: string; intervaloMin: number; datosDe: string | null; proxima: string | null };
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" });

function faltan(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

function hace(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "hace menos de un minuto";
  if (m === 1) return "hace 1 minuto";
  if (m < 60) return `hace ${m} minutos`;
  return `hace ${Math.floor(m / 60)} h ${m % 60} min`;
}

export default function FrescuraVentas() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    const traer = () =>
      fetch("/api/frescura")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => vivo && j && setDatos(j))
        .catch(() => {});
    traer();
    // Cada 30 segundos: así el "hace X minutos" de las ventas no se queda
    // viejo entre una sincronización y la siguiente.
    const cada30 = setInterval(traer, 30_000);
    const cadaSegundo = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      vivo = false;
      clearInterval(cada30);
      clearInterval(cadaSegundo);
    };
  }, []);

  if (!datos) return null;

  const pauta = datos.conectores.filter((c) => c.datosDe);
  const proximaPauta = pauta.length ? Math.min(...pauta.map((c) => new Date(c.proxima!).getTime())) : null;
  const pautaDe = pauta.length ? Math.min(...pauta.map((c) => new Date(c.datosDe!).getTime())) : null;
  const ventasDe = datos.ventas.datosDe ? new Date(datos.ventas.datosDe).getTime() : null;

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
        </span>
        Ventas de Shopify:{" "}
        <span className="text-foreground">
          {ventasDe ? `${hace(ahora - ventasDe)} (${hora(datos.ventas.datosDe!)})` : "sin datos"}
        </span>
      </span>
      <span>
        Meta y TikTok:{" "}
        <span className="text-foreground">
          {pautaDe == null
            ? "esperando la primera actualización"
            : proximaPauta! > ahora
              ? `datos de las ${hora(new Date(pautaDe).toISOString())} · próxima en ${faltan(proximaPauta! - ahora)}`
              : `datos de las ${hora(new Date(pautaDe).toISOString())} · actualizando…`}
        </span>
      </span>
    </p>
  );
}
