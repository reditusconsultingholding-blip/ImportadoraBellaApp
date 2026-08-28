"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Hablarle a Jarvis y que conteste en voz alta.
//
// Usa lo que ya trae el navegador: reconocimiento de voz para pasar lo que se
// dice a texto, y síntesis para leer la respuesta. No hace falta ningún
// servicio de audio ni subir la grabación a ningún lado — el audio no sale de
// la máquina, solo viaja el texto.
//
// Límite: el reconocimiento de voz existe en Chrome, Edge y Safari, pero no en
// Firefox. Cuando no está, se dice y queda el chat escrito, que funciona igual.

// El tipado de la API de voz no viene en las definiciones estándar de
// TypeScript, así que se declara lo que se usa y nada más.
type Reconocimiento = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type ConstructorReconocimiento = new () => Reconocimiento;

function traerReconocimiento(): ConstructorReconocimiento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocimiento;
    webkitSpeechRecognition?: ConstructorReconocimiento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoiceMode({
  onPregunta,
  ultimaRespuesta,
  pensando,
}: {
  /** Manda la pregunta al chat. Devuelve cuando ya se envió. */
  onPregunta: (texto: string) => Promise<void>;
  /** La última respuesta de Jarvis, para leerla en voz alta. */
  ultimaRespuesta: string | null;
  pensando: boolean;
}) {
  // Si el navegador reconoce voz se pregunta con useSyncExternalStore y no
  // desde un efecto: en el servidor no existe window, así que hace falta una
  // respuesta distinta para cada lado y esta es la forma que React trae para
  // eso. Con un efecto, además, se pinta un render de más.
  const disponible = useSyncExternalStore(
    () => () => {},
    () => traerReconocimiento() != null,
    () => false
  );
  const [escuchando, setEscuchando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [vozActiva, setVozActiva] = useState(false);
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<Reconocimiento | null>(null);
  const yaLeidoRef = useRef<string | null>(null);


  const leerEnVozAlta = useCallback((texto: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const frase = new SpeechSynthesisUtterance(texto);
    frase.lang = "es-EC";
    frase.rate = 1.05;

    // Se prefiere una voz en español si el sistema tiene alguna; si no, la que
    // haya. Con la voz por defecto en inglés, un texto en español suena a
    // cualquier cosa.
    const voces = window.speechSynthesis.getVoices();
    const enEspanol = voces.find((v) => v.lang.toLowerCase().startsWith("es"));
    if (enEspanol) frase.voice = enEspanol;

    frase.onstart = () => setLeyendo(true);
    frase.onend = () => setLeyendo(false);
    frase.onerror = () => setLeyendo(false);
    window.speechSynthesis.speak(frase);
  }, []);

  // Lee cada respuesta nueva, una sola vez, y solo con el modo voz encendido.
  useEffect(() => {
    if (!vozActiva || !ultimaRespuesta || pensando) return;
    if (yaLeidoRef.current === ultimaRespuesta) return;
    yaLeidoRef.current = ultimaRespuesta;
    leerEnVozAlta(ultimaRespuesta);
  }, [vozActiva, ultimaRespuesta, pensando, leerEnVozAlta]);

  function escuchar() {
    const Rec = traerReconocimiento();
    if (!Rec) return;

    // Si estaba leyendo, se calla: hablarle encima a la respuesta anterior es
    // molesto y además el micrófono se escucharía a sí mismo.
    window.speechSynthesis?.cancel();
    setLeyendo(false);
    setError(null);
    setParcial("");

    const rec = new Rec();
    recRef.current = rec;
    rec.lang = "es-EC";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let texto = "";
      for (let i = 0; i < e.results.length; i++) texto += e.results[i][0].transcript;
      setParcial(texto);
    };

    rec.onerror = (e) => {
      setError(
        e.error === "not-allowed"
          ? "Falta darle permiso al micrófono."
          : "No se entendió. Prueba de nuevo."
      );
      setEscuchando(false);
    };

    rec.onend = () => {
      setEscuchando(false);
      setParcial((texto) => {
        const limpio = texto.trim();
        if (limpio) {
          setVozActiva(true);
          onPregunta(limpio).catch(() => setError("No se pudo enviar la pregunta."));
        }
        return "";
      });
    };

    rec.start();
    setEscuchando(true);
  }

  function detener() {
    recRef.current?.stop();
    window.speechSynthesis?.cancel();
    setEscuchando(false);
    setLeyendo(false);
  }

  useEffect(() => () => {
    recRef.current?.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  if (!disponible) {
    return (
      <p className="text-xs text-muted">
        Este navegador no reconoce voz. Funciona en Chrome, Edge y Safari; en el resto queda el
        chat escrito.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={escuchando ? detener : escuchar}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
            escuchando
              ? "bg-critical text-white"
              : "bg-accent text-white hover:bg-accent-strong"
          }`}
        >
          <span aria-hidden>{escuchando ? "⏹" : "🎙"}</span>
          {escuchando ? "Escuchando… toca para parar" : "Hablar con Jarvis"}
        </button>

        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={vozActiva}
            onChange={(e) => {
              setVozActiva(e.target.checked);
              if (!e.target.checked) window.speechSynthesis?.cancel();
            }}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Que conteste en voz alta
        </label>

        {leyendo && (
          <button
            type="button"
            onClick={() => {
              window.speechSynthesis?.cancel();
              setLeyendo(false);
            }}
            className="text-xs text-muted underline underline-offset-2 transition hover:text-foreground"
          >
            Callar
          </button>
        )}
      </div>

      {parcial && <p className="text-xs text-muted">“{parcial}”</p>}
      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
