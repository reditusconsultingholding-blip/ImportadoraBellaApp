"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { TIPOS_PROPUESTA, type TipoPropuesta } from "@/lib/propuestas";

// Mandar una mejora, una duda o un error, dictado o escrito (Sebastian,
// 20-nov: «que puedan proponer mejoras por audio como en las otras apps»).
//
// El dictado usa el reconocimiento de voz del navegador, el mismo de «Hablar
// con Jarvis»: el audio no sale de la máquina, solo viaja el texto, y no
// cuesta nada. En Firefox no existe: ahí queda escribir.
//
// Una duda se puede mandar a dirección o preguntársela a Jarvis en el acto:
// casi siempre Jarvis la responde, y nadie tiene que esperar.

type Reconocimiento = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function traerReconocimiento(): (new () => Reconocimiento) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconocimiento;
    webkitSpeechRecognition?: new () => Reconocimiento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function DialogoPropuesta({
  seccion,
  ruta,
  tipoInicial = "MEJORA",
  textoInicial = "",
  puedeJarvis,
  onCerrar,
}: {
  seccion: string | null;
  ruta: string;
  tipoInicial?: TipoPropuesta;
  textoInicial?: string;
  puedeJarvis: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPropuesta>(tipoInicial);
  const [texto, setTexto] = useState(textoInicial);
  const [provisorio, setProvisorio] = useState("");
  const [dictado, setDictado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const rec = useRef<Reconocimiento | null>(null);
  const [hayVoz] = useState(() => traerReconocimiento() !== null);

  useEffect(() => () => rec.current?.abort(), []);
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  function dictar() {
    if (escuchando) {
      rec.current?.stop();
      return;
    }
    const Cons = traerReconocimiento();
    if (!Cons) return;
    const r = new Cons();
    r.lang = "es-EC";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finales = "";
      let enCurso = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finales += res[0].transcript;
        else enCurso += res[0].transcript;
      }
      if (finales) {
        setTexto((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${finales.trim()}`);
        setDictado(true);
      }
      setProvisorio(enCurso);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("El navegador no dio permiso al micrófono. Actívalo en el candado de la barra de direcciones.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("No se pudo escuchar. Prueba otra vez o escríbelo.");
      }
    };
    r.onend = () => {
      setEscuchando(false);
      setProvisorio("");
    };
    rec.current = r;
    setError(null);
    r.start();
    setEscuchando(true);
  }

  async function enviar() {
    rec.current?.stop();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/propuestas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, texto, dictado, ruta, seccion }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo enviar.");
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setEnviando(false);
    }
  }

  function preguntarAJarvis() {
    rec.current?.stop();
    const contexto = seccion ? `Estoy en «${seccion}». ` : "";
    onCerrar();
    router.push(`/dashboard/jarvis?pregunta=${encodeURIComponent(contexto + texto.trim())}`);
  }

  const contenido = listo ? (
    <div className="p-5 text-center">
      <p className="text-3xl" aria-hidden="true">✓</p>
      <p className="mt-2 text-base font-semibold text-foreground">¡Recibido!</p>
      <p className="mt-1 text-sm text-muted">
        Le llegó a dirección. Cuando te respondan te aparece en Notificaciones, y lo puedes seguir en «Propuestas y dudas».
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            onCerrar();
            router.push("/dashboard/propuestas");
          }}
          className="rounded-full border border-border px-4 py-1.5 text-sm text-foreground hover:border-accent"
        >
          Ver mis propuestas
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Listo
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex gap-2" role="radiogroup" aria-label="Qué es">
        {TIPOS_PROPUESTA.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tipo === t.id}
            onClick={() => setTipo(t.id)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition ${
              tipo === t.id ? "border-accent bg-accent text-white" : "border-border text-foreground hover:border-accent"
            }`}
          >
            {t.texto}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{TIPOS_PROPUESTA.find((t) => t.id === tipo)?.ayuda}</p>

      {hayVoz && (
        <button
          type="button"
          onClick={dictar}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
            escuchando ? "animate-pulse bg-red-600 text-white" : "bg-brand-navy text-white hover:opacity-90"
          }`}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <rect x="7" y="2.5" width="6" height="10" rx="3" />
            <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" strokeLinecap="round" />
          </svg>
          {escuchando ? "Escuchando… toca para terminar" : texto ? "Seguir dictando" : "Toca y dilo con tu voz"}
        </button>
      )}

      <div>
        <textarea
          value={texto + (provisorio ? `${texto ? " " : ""}${provisorio}` : "")}
          onChange={(e) => {
            setTexto(e.target.value);
            setProvisorio("");
          }}
          rows={5}
          placeholder={
            hayVoz
              ? "Lo que dictes aparece acá, y lo puedes corregir antes de enviarlo."
              : "Escríbelo acá. (Este navegador no dicta: en Chrome, Edge o Safari puedes decirlo con la voz.)"
          }
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        {seccion && <p className="mt-1 text-[11px] text-muted">Va con la pantalla donde estás: {seccion}.</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {tipo === "DUDA" && puedeJarvis && (
          <button
            type="button"
            disabled={texto.trim().length < 3}
            onClick={preguntarAJarvis}
            className="rounded-full border border-accent px-4 py-1.5 text-sm font-semibold text-accent hover:bg-accent hover:text-white disabled:opacity-40"
          >
            Preguntarle a Jarvis ya
          </button>
        )}
        <button
          type="button"
          disabled={enviando || texto.trim().length < 5}
          onClick={enviar}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
        >
          {enviando ? "Enviando…" : "Enviar a dirección"}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onCerrar}>
      <div
        role="dialog"
        aria-label="Proponer una mejora o contar una duda"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-brand-navy px-4 py-3 text-white">
          <div>
            <p className="text-sm font-semibold">Proponer, preguntar o avisar</p>
            <p className="text-[11px] text-white/70">Dilo con tu voz o escríbelo. Le llega a dirección.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1 text-white/80 hover:bg-white/10">
            ✕
          </button>
        </div>
        {contenido}
      </div>
    </div>,
    document.body,
  );
}
