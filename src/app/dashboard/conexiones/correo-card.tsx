"use client";

import { useState } from "react";
import { Girando } from "../navegar";

// El estado del correo saliente, y cómo encenderlo sin llamar a nadie.
//
// El módulo de correo está construido y probado, pero apagado: le faltan dos
// cosas que solo puede hacer quien tiene las cuentas —verificar el dominio en
// Resend y pegar la clave en Railway—. Hasta ahora eso vivía en un PDF y en
// una conversación, así que la única forma de saber si estaba listo era
// preguntar.
//
// Esta tarjeta lo dice sola: si está configurado, si el dominio responde, y
// deja probarlo de un clic. Cuando alguien pegue la clave, va a poder
// confirmar que funciona sin esperar respuesta de nadie.

export default function CorreoCard({
  configurado,
  dominio,
}: {
  /** Si hay una clave de Resend cargada en el servidor. */
  configurado: boolean;
  /** El dominio desde el que se envía, si está definido. */
  dominio: string | null;
}) {
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

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

  return (
    <div className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            configurado ? "bg-good-bg text-good" : "bg-surface-2 text-muted"
          }`}
        >
          {configurado ? "Configurado" : "Apagado"}
        </span>
        <span className="text-sm">
          {configurado
            ? `Se envía desde ${dominio ? `jarvis@${dominio}` : "el remitente de prueba de Resend"}.`
            : "El módulo está construido y probado; falta encenderlo."}
        </span>
      </div>

      {configurado ? (
        <>
          <p className="text-xs leading-relaxed text-muted">
            Con esto andando salen el reporte diario por correo y los avisos a editores. Probalo
            para confirmar que el dominio quedó bien verificado.
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
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted">
            Son dos pasos y no hace falta desarrollo. Mientras tanto no se pierde nada: los
            reportes se consultan y se descargan desde la plataforma, y las contraseñas las
            restablece un administrador desde Usuarios.
          </p>
          <ol className="flex flex-col gap-1.5 text-xs text-muted">
            <li>
              <strong className="text-foreground">1.</strong> En resend.com, agregar el dominio{" "}
              <code className="rounded bg-surface-2 px-1">jarvisecom.com</code> y cargar los tres
              registros que muestra en el DNS de name.com. Si Resend pide el host{" "}
              <code className="rounded bg-surface-2 px-1">send.jarvisecom.com</code>, en name.com se
              escribe solo <code className="rounded bg-surface-2 px-1">send</code>.
            </li>
            <li>
              <strong className="text-foreground">2.</strong> En Railway, crear las variables{" "}
              <code className="rounded bg-surface-2 px-1">RESEND_API_KEY</code> y{" "}
              <code className="rounded bg-surface-2 px-1">EMAIL_FROM_DOMAIN=jarvisecom.com</code>, y
              aplicar los cambios.
            </li>
          </ol>
          <p className="text-[11px] text-muted">
            Cuando esté, esta tarjeta va a decir «Configurado» y va a aparecer acá el botón para
            mandar un correo de prueba.
          </p>
        </>
      )}
    </div>
  );
}
