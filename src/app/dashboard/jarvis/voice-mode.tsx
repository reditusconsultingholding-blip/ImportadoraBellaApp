"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Hablar con Jarvis como en una llamada.
//
// Usa lo que ya trae el navegador: reconocimiento de voz para pasar lo que se
// dice a texto, y síntesis para leer la respuesta. La grabación no sale de la
// máquina — solo viaja el texto.
//
// La diferencia con dictar una pregunta es el modo continuo: cuando Jarvis
// termina de hablar, el micrófono se vuelve a abrir solo. Sin eso hay que
// apretar un botón entre cada frase, y deja de sentirse una conversación.
//
// Límite: el reconocimiento de voz existe en Chrome, Edge y Safari, pero no en
// Firefox. Cuando no está, se dice y queda el chat escrito.

type Reconocimiento = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type ConstructorReconocimiento = new () => Reconocimiento;

/**
 * Lee una preferencia del navegador.
 *
 * En el servidor no hay localStorage, y un navegador con el almacenamiento
 * bloqueado lanza excepción al tocarlo — ninguna de las dos cosas es un error
 * acá: se usa lo que venga por defecto.
 */
function guardado(clave: string, siNoHay: string) {
  if (typeof window === "undefined") return siNoHay;
  try {
    return localStorage.getItem(clave) ?? siNoHay;
  } catch {
    return siNoHay;
  }
}

function traerReconocimiento(): ConstructorReconocimiento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocimiento;
    webkitSpeechRecognition?: ConstructorReconocimiento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dónde termina la última frase cerrada del texto.
 *
 * Sirve para hablar mientras la respuesta todavía se está escribiendo: se lee
 * hasta acá y el resto espera al pedazo siguiente.
 *
 * El punto tiene que estar seguido de un espacio o del final. Sin esa condición,
 * "el CPA es 7.40" se partiría en "el CPA es 7." y Jarvis diría "siete punto"
 * y se callaría a mitad del número — justo con las cifras, que es lo que más
 * importa que se entienda.
 */
function finDeFraseCerrada(texto: string): number {
  const marcas = /[.!?…:;\n](?=\s|$)/g;
  let fin = -1;
  let m: RegExpExecArray | null;
  while ((m = marcas.exec(texto)) !== null) fin = m.index + 1;
  return fin;
}

export default function VoiceMode({
  onPregunta,
  respuestaEnCurso,
  ultimaRespuesta,
  pensando,
}: {
  onPregunta: (texto: string) => Promise<void>;
  /**
   * Lo que Jarvis está escribiendo en este momento, o null si no hay un turno
   * abierto. Es lo que permite empezar a hablar antes de que termine de pensar.
   */
  respuestaEnCurso: string | null;
  ultimaRespuesta: string | null;
  pensando: boolean;
}) {
  // Si el navegador reconoce voz se pregunta con useSyncExternalStore y no
  // desde un efecto: en el servidor no existe window, y hace falta una
  // respuesta distinta para cada lado.
  const disponible = useSyncExternalStore(
    () => () => {},
    () => traerReconocimiento() != null,
    () => false
  );

  const [enLlamada, setEnLlamada] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState<string | null>(null);

  // La voz elegida y la velocidad. Se guardan en el navegador porque son de
  // quien escucha, no de la empresa: en la misma cuenta, cada persona puede
  // preferir otra.
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);

  // La preferencia guardada se lee al construir el estado y no en un efecto:
  // hacerlo en un efecto obliga a un render de más con el valor equivocado.
  //
  // No hay riesgo de descalce con el servidor porque estos controles solo se
  // dibujan cuando ya hay voces cargadas, y en el servidor nunca las hay.
  const [vozElegida, setVozElegida] = useState<string>(() => guardado("jarvis-voz", ""));
  const [velocidad, setVelocidad] = useState<number>(() =>
    Number(guardado("jarvis-velocidad", "")) || 1.08
  );

  // Las voces llegan tarde: al primer render getVoices() suele devolver una
  // lista vacía y recién después el navegador avisa que ya las cargó.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const cargar = () => {
      const todas = window.speechSynthesis.getVoices();
      const enEspanol = todas.filter((v) => v.lang.toLowerCase().startsWith("es"));
      // Si no hay ninguna en español se muestran todas: es preferible una voz
      // en inglés leyendo español a un selector vacío sin explicación.
      setVoces(enEspanol.length > 0 ? enEspanol : todas);
    };

    cargar();
    window.speechSynthesis.addEventListener("voiceschanged", cargar);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", cargar);
  }, []);

  const guardarVoz = useCallback((nombre: string) => {
    setVozElegida(nombre);
    try {
      localStorage.setItem("jarvis-voz", nombre);
    } catch {
      // Se pierde la preferencia al recargar, pero la llamada funciona igual.
    }
  }, []);

  const guardarVelocidad = useCallback((r: number) => {
    setVelocidad(r);
    try {
      localStorage.setItem("jarvis-velocidad", String(r));
    } catch {
      // Igual que arriba.
    }
  }, []);

  const recRef = useRef<Reconocimiento | null>(null);
  const enLlamadaRef = useRef(false);

  // Hablar mientras la respuesta se escribe.
  //
  // Antes se esperaba la respuesta COMPLETA y después se leía de una. En una
  // llamada eso son veinte o treinta segundos de silencio con el micrófono
  // cerrado: por teléfono nadie aguanta eso, uno cuelga pensando que se cortó.
  //
  // Ahora se lee por frases. Apenas hay una frase cerrada se manda a hablar, y
  // mientras suena van llegando las siguientes. El navegador las encola solo
  // —por eso NO se llama a cancel() entre frases, que fue el error de la primera
  // versión: cancelaba la que estaba sonando y solo se oía la última—.
  //
  // `yaHablado` guarda el texto ya entregado al sintetizador. Comparando por
  // prefijo se sabe si lo que llega continúa el mismo turno o es uno nuevo, sin
  // necesidad de que nadie avise que el turno cambió.
  const yaHabladoRef = useRef("");
  const pendientesRef = useRef(0);
  const turnoCerradoRef = useRef(false);
  // La escucha se reabre a sí misma cuando hay silencio o cuando Jarvis
  // termina de hablar. Se llama por referencia para no auto-referenciar el
  // callback.
  const escucharRef = useRef<() => void>(() => {});

  const detenerTodo = useCallback(() => {
    enLlamadaRef.current = false;
    try {
      recRef.current?.abort();
    } catch {
      // Abortar algo que ya terminó lanza excepción y no importa.
    }
    recRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    // La cola de frases se olvida junto con la llamada: si no, al volver a
    // entrar se reabriría el micrófono por una frase de la llamada anterior.
    yaHabladoRef.current = "";
    pendientesRef.current = 0;
    turnoCerradoRef.current = false;
    setEscuchando(false);
    setLeyendo(false);
    setParcial("");
  }, []);

  /** Abre el micrófono y manda lo que se diga. */
  const escuchar = useCallback(() => {
    const Rec = traerReconocimiento();
    if (!Rec || !enLlamadaRef.current) return;

    const rec = new Rec();
    recRef.current = rec;
    rec.lang = "es-EC";
    rec.continuous = false;
    rec.interimResults = true;

    let dicho = "";

    rec.onresult = (e) => {
      let texto = "";
      for (let i = 0; i < e.results.length; i++) texto += e.results[i][0].transcript;
      dicho = texto;
      setParcial(texto);
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        setError("Falta darle permiso al micrófono.");
        enLlamadaRef.current = false;
        setEnLlamada(false);
      }
      // "no-speech" pasa todo el tiempo en una conversación real: no es un
      // error, es un silencio.
      setEscuchando(false);
    };

    rec.onend = () => {
      setEscuchando(false);
      setParcial("");
      const limpio = dicho.trim();

      if (limpio) {
        onPregunta(limpio).catch(() => setError("No se pudo enviar la pregunta."));
      } else if (enLlamadaRef.current) {
        // Silencio: se reabre el micrófono en vez de cortar la llamada.
        setTimeout(() => escucharRef.current(), 300);
      }
    };

    try {
      rec.start();
      setEscuchando(true);
      setError(null);
    } catch {
      // Arrancar dos veces seguidas lanza excepción; se ignora.
    }
  }, [onPregunta]);


  /** Manda una frase a la cola del navegador. No cancela lo que ya suena. */
  const encolarFrase = useCallback(
    (texto: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      const frase = new SpeechSynthesisUtterance(texto);
      frase.lang = "es-EC";
      frase.rate = velocidad;

      // La voz elegida, y si no hay ninguna elegida la primera en español: con
      // la voz por defecto en inglés, un texto en español suena a cualquier
      // cosa.
      const disponibles = window.speechSynthesis.getVoices();
      const elegida =
        disponibles.find((v) => v.name === vozElegida) ??
        disponibles.find((v) => v.lang.toLowerCase().startsWith("es"));
      if (elegida) frase.voice = elegida;

      const terminoUna = () => {
        pendientesRef.current = Math.max(0, pendientesRef.current - 1);
        if (pendientesRef.current > 0) return;

        setLeyendo(false);
        // El micrófono se reabre cuando se terminó de hablar TODO y el turno ya
        // está cerrado. Reabrirlo entre frases haría que Jarvis se escuche a sí
        // mismo y se conteste.
        if (turnoCerradoRef.current && enLlamadaRef.current) {
          setTimeout(() => escucharRef.current(), 250);
        }
      };

      frase.onstart = () => setLeyendo(true);
      frase.onend = terminoUna;
      frase.onerror = terminoUna;

      pendientesRef.current += 1;
      window.speechSynthesis.speak(frase);
    },
    [vozElegida, velocidad]
  );

  // La referencia se pone al día en un efecto y no durante el render: el
  // render tiene que estar libre de efectos secundarios.
  useEffect(() => {
    escucharRef.current = escuchar;
  }, [escuchar]);

  // Va leyendo la respuesta a medida que se escribe.
  useEffect(() => {
    if (!enLlamada) {
      yaHabladoRef.current = "";
      return;
    }

    // Mientras el turno está abierto se lee lo que va llegando; cuando se
    // cierra, `respuestaEnCurso` vuelve a null y el texto definitivo es
    // `ultimaRespuesta`.
    const cerrado = respuestaEnCurso === null;
    const texto = respuestaEnCurso ?? ultimaRespuesta ?? "";

    // Si lo que llega no continúa lo que ya se habló, es otro turno: se corta
    // lo que esté sonando y se empieza de cero. También entra por acá el
    // arranque de cada pregunta, donde el texto es la cadena vacía.
    if (!texto.startsWith(yaHabladoRef.current)) {
      yaHabladoRef.current = "";
      pendientesRef.current = 0;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    }

    turnoCerradoRef.current = cerrado;

    const nuevo = texto.slice(yaHabladoRef.current.length);
    if (!nuevo) {
      // El turno cerró y no sobró nada por decir: puede que la última frase ya
      // se haya terminado de leer, así que el micrófono se reabre acá o no se
      // reabre nunca.
      if (cerrado && pendientesRef.current === 0 && texto) {
        setTimeout(() => {
          if (enLlamadaRef.current) escucharRef.current();
        }, 250);
      }
      return;
    }

    // Abierto: solo frases cerradas. Cerrado: todo lo que quede, aunque no
    // termine en punto.
    const corte = cerrado ? nuevo.length : finDeFraseCerrada(nuevo);
    if (corte <= 0) return;

    yaHabladoRef.current = texto.slice(0, yaHabladoRef.current.length + corte);
    const frase = nuevo.slice(0, corte).trim();
    if (frase) encolarFrase(frase);
  }, [enLlamada, respuestaEnCurso, ultimaRespuesta, encolarFrase]);

  async function entrarALlamada() {
    setError(null);
    try {
      // Se pide el micrófono explícitamente antes de arrancar: así el permiso
      // se resuelve una vez y no en medio de la conversación.
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No se pudo usar el micrófono. Hay que darle permiso al navegador.");
      return;
    }
    enLlamadaRef.current = true;
    setEnLlamada(true);
    escuchar();
  }

  function colgar() {
    detenerTodo();
    setEnLlamada(false);
  }

  useEffect(() => () => detenerTodo(), [detenerTodo]);

  if (!disponible) {
    return (
      <p className="text-xs text-muted">
        Este navegador no reconoce voz. La llamada funciona en Chrome, Edge y Safari; aquí queda el
        chat escrito.
      </p>
    );
  }

  const estado = leyendo
    ? "Jarvis está hablando"
    : pensando
      ? "Pensando…"
      : escuchando
        ? "Te escucho"
        : "En llamada";

  return (
    <div className="flex flex-col gap-2">
      {!enLlamada ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={entrarALlamada}
            className="flex w-fit items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
          >
            <span aria-hidden>🎙</span>
            Hablar con Jarvis
          </button>

          {voces.length > 0 && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                Voz
                <select
                  value={vozElegida}
                  onChange={(e) => {
                    guardarVoz(e.target.value);
                    // Se prueba al elegirla. Sin escucharla, elegir entre
                    // "Microsoft Sabina" y "Google español" es adivinar.
                    const v = window.speechSynthesis
                      .getVoices()
                      .find((x) => x.name === e.target.value);
                    if (!v) return;
                    window.speechSynthesis.cancel();
                    const p = new SpeechSynthesisUtterance("Listo, así sueno.");
                    p.voice = v;
                    p.lang = v.lang;
                    p.rate = velocidad;
                    window.speechSynthesis.speak(p);
                  }}
                  className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-accent"
                >
                  <option value="">La que traiga el navegador</option>
                  {voces.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-xs text-muted">
                Velocidad
                <input
                  type="range"
                  min={0.7}
                  max={1.6}
                  step={0.02}
                  value={velocidad}
                  onChange={(e) => guardarVelocidad(Number(e.target.value))}
                  className="w-24 accent-[var(--color-accent)]"
                />
                <span className="tabular-nums">{velocidad.toFixed(2)}×</span>
              </label>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent bg-good-bg px-3 py-2.5">
          {/* El punto que late marca de quién es el turno: sin eso no se sabe si
              hay que hablar o esperar. */}
          <span className="relative flex h-3 w-3 shrink-0">
            {escuchando && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-70" />
            )}
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${
                leyendo ? "bg-accent-strong" : pensando ? "bg-warning" : "bg-good"
              }`}
            />
          </span>

          <span className="text-sm font-medium text-accent-strong">{estado}</span>

          {parcial && (
            <span className="min-w-0 flex-1 truncate text-xs text-muted">“{parcial}”</span>
          )}

          {leyendo && (
            <button
              type="button"
              onClick={() => {
                window.speechSynthesis?.cancel();
                setLeyendo(false);
                escuchar();
              }}
              className="text-xs text-muted underline underline-offset-2 transition hover:text-foreground"
            >
              Interrumpir
            </button>
          )}

          <button
            type="button"
            onClick={colgar}
            className="ml-auto shrink-0 rounded-full bg-critical px-3 py-1 text-xs font-medium text-white transition hover:opacity-90"
          >
            Colgar
          </button>
        </div>
      )}

      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
