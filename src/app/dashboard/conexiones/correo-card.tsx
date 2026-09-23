"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Girando } from "../navegar";

// El estado del correo saliente, y cómo encenderlo sin llamar a nadie.
//
// El módulo de correo está construido y probado. Lo que lo tuvo apagado meses
// fue un trámite: la clave de Resend vivía solo en una variable de Railway, y
// quien decide sobre el correo no tiene ese acceso a mano —"no me acuerdo
// dónde tengo el Railway"—. Los reportes se quedaron sin salir por eso, no por
// el código.
//
// Ahora la clave se pega acá y se guarda cifrada en la base, igual que el token
// de Notion. La variable de Railway sigue funcionando y le gana, por si algún
// día conviene tenerla afuera.
//
// El dominio es aparte, y la tarjeta distingue los dos estados en vez de decir
// "configurado" y listo: sin dominio verificado Resend manda desde su
// remitente de prueba, que SOLO entrega a la casilla dueña de la cuenta. Con
// clave y sin dominio, los correos "salen" y no llega ninguno — el peor de los
// estados, porque parece que anda.

export default function CorreoCard({
  configurado,
  dominio,
}: {
  /** Si hay clave de Resend, por variable de servidor o guardada acá. */
  configurado: boolean;
  /** El dominio verificado desde el que se envía, si hay alguno. */
  dominio: string | null;
}) {
  const router = useRouter();
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorClave, setErrorClave] = useState<string | null>(null);

  async function probar() {
    setProbando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/correo/prueba", { method: "POST" });
      const j = await res.json();
      setResultado({
        ok: res.ok && j.ok === true,
        texto: j.ok ? `Enviado a ${j.destino}. Revisá la bandeja.` : (j.error ?? "No se pudo enviar."),
      });
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setProbando(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    setErrorClave(null);
    try {
      const res = await fetch("/api/correo/clave", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar.");
      setClave("");
      router.refresh();
    } catch (e) {
      setErrorClave(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            configurado && dominio
              ? "bg-good-bg text-good"
              : configurado
                ? "bg-pending-bg text-warning"
                : "bg-surface-2 text-muted"
          }`}
        >
          {configurado && dominio ? "Andando" : configurado ? "A medias" : "Apagado"}
        </span>
        <span className="text-sm">
          {configurado && dominio
            ? `Se envía desde jarvis@${dominio}.`
            : configurado
              ? "Hay clave, pero todavía no hay dominio verificado."
              : "Falta la clave de Resend."}
        </span>
      </div>

      {/* Sin clave: el campo para pegarla, que es todo lo que hace falta. */}
      {!configurado && (
        <>
          <p className="text-xs leading-relaxed text-muted">
            En resend.com → <strong className="text-foreground">API Keys → Create API Key</strong>,
            con permiso de envío. Empieza con{" "}
            <code className="rounded bg-surface-2 px-1">re_</code> y se muestra una sola vez. Se
            guarda cifrada acá mismo; no hace falta tocar Railway.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="re_…"
              autoComplete="off"
              className="min-w-[16rem] flex-1 rounded border border-border bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || !clave.trim()}
              className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
            >
              {guardando && <Girando />}
              {guardando ? "Probando…" : "Guardar"}
            </button>
          </div>
          {errorClave && <p className="text-xs text-critical">{errorClave}</p>}
          <p className="text-[11px] text-muted">
            Antes de guardarla se prueba contra Resend: una clave mal copiada o revocada no entra.
          </p>
        </>
      )}

      {/* Con clave y sin dominio: los correos salen y casi no llegan. */}
      {configurado && !dominio && (
        <>
          <p className="rounded border border-warning/40 bg-pending-bg px-3 py-2 text-xs leading-relaxed text-warning">
            Sin dominio verificado, Resend manda desde su remitente de prueba y{" "}
            <strong>solo le entrega a la casilla dueña de la cuenta de Resend</strong>. Al resto
            del equipo no le va a llegar nada.
          </p>
          <ol className="flex flex-col gap-1.5 text-xs text-muted">
            <li>
              <strong className="text-foreground">1.</strong> En resend.com → Domains, agregar{" "}
              <code className="rounded bg-surface-2 px-1">jarvisecom.com</code>.
            </li>
            <li>
              <strong className="text-foreground">2.</strong> Cargar en el DNS de{" "}
              <strong className="text-foreground">name.com</strong> los registros que muestra, tal
              cual. Donde Resend diga{" "}
              <code className="rounded bg-surface-2 px-1">send.jarvisecom.com</code>, en name.com se
              escribe solo <code className="rounded bg-surface-2 px-1">send</code>.
            </li>
            <li>
              <strong className="text-foreground">3.</strong> Volver a Resend y darle Verify. Tarda
              entre unos minutos y una hora.
            </li>
          </ol>
        </>
      )}

      {/* Todo listo: el botón de prueba. */}
      {configurado && dominio && (
        <>
          <p className="text-xs leading-relaxed text-muted">
            Con esto andando salen el reporte diario, el semanal y los avisos a editores.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={probar}
              disabled={probando}
              className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
            >
              {probando && <Girando />}
              {probando ? "Enviando…" : "Enviar correo de prueba"}
            </button>
            {resultado && (
              <span className={`text-xs ${resultado.ok ? "text-good" : "text-critical"}`}>
                {resultado.texto}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
