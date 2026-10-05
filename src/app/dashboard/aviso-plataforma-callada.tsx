import Link from "next/link";
import type { PlataformaCallada } from "@/lib/plataformas-calladas";

// El aviso de que una plataforma de pauta dejó de cargar.
//
// Va ARRIBA DE TODO y no en una esquina a propósito. Lo que hay que impedir no
// es que alguien no se entere de un problema técnico: es que alguien lea el CPA
// de este panel y tome una decisión de plata con un número que está bajo porque
// falta el gasto de una plataforma. Ese aviso llega tarde si hay que buscarlo.
//
// Y por eso el texto dice QUÉ NÚMEROS no hay que creer, en vez de decir que una
// sincronización falló. "Error en el conector de TikTok" se posterga; "el CPA
// que estás viendo sale más bajo que el real" se atiende.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fecha = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default function AvisoPlataformaCallada({
  avisos,
  verCifras,
}: {
  avisos: PlataformaCallada[];
  /** Sin permiso para ver dinero no se nombra el gasto, pero sí el problema. */
  verCifras: boolean;
}) {
  if (avisos.length === 0) return null;

  return (
    <div className="rounded border border-critical/50 bg-critical-bg/60 px-4 py-3">
      {avisos.map((a) => (
        <div key={a.etiqueta} className="flex flex-col gap-1 text-sm">
          <p className="flex items-center gap-2 font-medium text-critical">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-critical" />
            </span>
            {a.etiqueta} no está cargando datos
            {a.ultimoDia ? ` desde el ${fecha(a.ultimoDia)}` : ""}.
          </p>

          {verCifras && a.gastoDiario != null && (
            <p className="text-muted">
              Venía gastando unos <span className="text-foreground">{money(a.gastoDiario)}</span> por
              día. Mientras siga así, el CPA y la utilidad de este panel salen{" "}
              <span className="text-foreground">más bajos que los reales</span>: las ventas están
              todas y el gasto de {a.etiqueta} no.
            </p>
          )}
          {verCifras && a.gastoDiario == null && (
            <p className="text-muted">
              Mientras siga así, el CPA y la utilidad de este panel salen más bajos que los reales:
              las ventas están todas y el gasto de {a.etiqueta} no.
            </p>
          )}
          {!verCifras && (
            <p className="text-muted">
              Los números de {a.etiqueta} están quietos desde entonces. No es que no haya pasado
              nada: no están llegando.
            </p>
          )}

          <p className="text-xs text-muted">
            Se arregla volviendo a conectar {a.etiqueta} en Windsor.ai — la app pregunta bien, es
            Windsor el que no está devolviendo nada.{" "}
            <Link href="/dashboard/conexiones" className="text-accent hover:underline">
              Ver Conexiones
            </Link>
          </p>
        </div>
      ))}
    </div>
  );
}
