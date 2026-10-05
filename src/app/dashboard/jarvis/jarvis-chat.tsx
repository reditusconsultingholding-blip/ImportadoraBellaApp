"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VoiceMode from "./voice-mode";
import ListaChats from "./lista-chats";
import { reducirImagen, TIPOS_ACEPTADOS, type ImagenLista } from "./reducir-imagen";

type Message = {
  role: "user" | "assistant";
  content: string;
  /** Las miniaturas de lo que se adjuntó, solo para volver a dibujarlas. */
  vistas?: string[];
};
type ProposedAction = { id: string; type: string; reason: string };
type Conversacion = { id: string; titulo: string; updatedAt: string };

const ACTION_LABEL: Record<string, string> = {
  PAUSE_CAMPAIGN: "Pausar campaña",
  RESUME_CAMPAIGN: "Reanudar campaña",
  SCALE_BUDGET: "Ajustar presupuesto",
};

const MAX_IMAGENES = 4;

export default function JarvisChat({
  inicial,
  modelo,
}: {
  inicial: Conversacion[];
  /** Qué modelo contesta, para poder decirlo en la cabecera. */
  modelo: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingActions, setPendingActions] = useState<ProposedAction[]>([]);
  const [resolvedActionIds, setResolvedActionIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lo que Jarvis está escribiendo ahora mismo, y qué está consultando.
  //
  // Van separados de `messages` a propósito: el turno en curso todavía no es un
  // mensaje guardado, y mezclarlos obligaría a reemplazar el último elemento del
  // array en cada pedazo que llega.
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [consultando, setConsultando] = useState<string | null>(null);

  const [adjuntas, setAdjuntas] = useState<ImagenLista[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  const finRef = useRef<HTMLDivElement>(null);

  const [conversaciones, setConversaciones] = useState<Conversacion[]>(inicial);
  const [activa, setActiva] = useState<string | null>(null);

  const cargarLista = useCallback(async () => {
    const res = await fetch("/api/jarvis/conversaciones");
    if (!res.ok) return;
    const data = await res.json();
    setConversaciones(data.conversaciones ?? []);
  }, []);

  // La vista baja sola mientras llega la respuesta: si no, el texto crece fuera
  // de la pantalla y hay que perseguirlo con la rueda del ratón.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [messages, enCurso, consultando]);

  /** Mete archivos a la bandeja de adjuntos, reducidos y validados. */
  const agregarArchivos = useCallback(async (archivos: File[]) => {
    const imagenes = archivos.filter((a) => TIPOS_ACEPTADOS.includes(a.type));
    if (imagenes.length === 0) {
      if (archivos.length > 0) setError("Solo puedo leer imágenes PNG, JPG, WEBP o GIF.");
      return;
    }
    setError(null);
    for (const archivo of imagenes) {
      try {
        const lista = await reducirImagen(archivo);
        setAdjuntas((prev) => (prev.length >= MAX_IMAGENES ? prev : [...prev, lista]));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pude preparar esa imagen.");
      }
    }
  }, []);

  // Pegar una captura con Ctrl+V es la forma más rápida de adjuntarla: se toma
  // la pantalla y se pega, sin pasar por un archivo. Vale soportarlo.
  function alPegar(e: React.ClipboardEvent) {
    const archivos = Array.from(e.clipboardData.files);
    if (archivos.length === 0) return;
    e.preventDefault();
    agregarArchivos(archivos);
  }

  // Preguntar por texto y preguntar por voz terminan en el mismo lugar: si
  // fueran dos caminos, el historial se les desincronizaría.
  const preguntar = useCallback(
    async (texto: string) => {
      const limpio = texto.trim();
      // Una captura sola, sin texto, es una pregunta válida: "mirá esto".
      if ((!limpio && adjuntas.length === 0) || loading) return;

      const imagenes = adjuntas.map((a) => ({ media_type: a.media_type, data: a.data }));
      const vistas = adjuntas.map((a) => a.vistaPrevia);

      const nextHistory: Message[] = [
        ...messages,
        { role: "user", content: limpio, ...(vistas.length > 0 ? { vistas } : {}) },
      ];
      setMessages(nextHistory);
      setInput("");
      setAdjuntas([]);
      setLoading(true);
      setEnCurso("");
      setConsultando(null);
      setError(null);

      // Al servidor va el historial con las imágenes de ESTE turno. Las de
      // turnos anteriores no se reenvían: ya fueron leídas, lo que importaba de
      // ellas está en lo que Jarvis contestó, y arrastrarlas haría cada
      // pregunta más lenta y más cara que la anterior.
      const paraEnviar = nextHistory.map((m, i) => ({
        role: m.role,
        content: m.content,
        ...(i === nextHistory.length - 1 && imagenes.length > 0 ? { imagenes } : {}),
      }));

      let respuesta = "";
      let conversacionNueva: string | null = null;
      let acciones: ProposedAction[] = [];
      let falla: string | null = null;

      try {
        const res = await fetch("/api/jarvis/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history: paraEnviar, conversacionId: activa }),
        });

        // Los rechazos tempranos —sin permiso, imagen inválida— siguen llegando
        // como JSON con su código: solo el camino bueno viene por pedazos.
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          falla = data.error ?? "Error inesperado.";
        } else {
          const lector = res.body.getReader();
          const decoder = new TextDecoder();
          let resto = "";

          for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            resto += decoder.decode(value, { stream: true });

            // Un pedazo de red puede cortar una línea por la mitad: se procesan
            // las líneas completas y lo que sobra espera al pedazo siguiente.
            const lineas = resto.split("\n");
            resto = lineas.pop() ?? "";

            for (const linea of lineas) {
              if (!linea.trim()) continue;
              let ev: Record<string, unknown>;
              try {
                ev = JSON.parse(linea);
              } catch {
                continue;
              }

              if (ev.tipo === "texto") {
                respuesta += String(ev.texto);
                setEnCurso(respuesta);
                setConsultando(null);
              } else if (ev.tipo === "consultando") {
                setConsultando(String(ev.que));
              } else if (ev.tipo === "fin") {
                respuesta = String(ev.reply ?? respuesta);
                conversacionNueva = (ev.conversacionId as string | null) ?? null;
                acciones = (ev.proposedActions as ProposedAction[]) ?? [];
              } else if (ev.tipo === "error") {
                falla = String(ev.error);
              }
            }
          }
        }
      } catch {
        // Se cortó la conexión a mitad de camino. Si ya había texto, se
        // conserva: media respuesta sirve más que una pantalla en blanco.
        falla = respuesta
          ? "Se cortó la conexión antes de terminar."
          : "No se pudo conectar. Probá de nuevo.";
      }

      setLoading(false);
      setEnCurso(null);
      setConsultando(null);

      if (respuesta.trim()) {
        setMessages([...nextHistory, { role: "assistant", content: respuesta }]);
      }
      if (falla) setError(falla);
      if (conversacionNueva) setActiva(conversacionNueva);
      if (acciones.length > 0) setPendingActions((prev) => [...prev, ...acciones]);
      if (!falla) cargarLista();
    },
    [adjuntas, loading, messages, activa, cargarLista]
  );

  async function abrir(id: string) {
    if (loading) return;
    const res = await fetch(`/api/jarvis/conversaciones/${id}`);
    if (!res.ok) {
      setError("No se pudo abrir esa conversación.");
      return;
    }
    const data = await res.json();
    setMessages(data.mensajes ?? []);
    setActiva(id);
    setError(null);
    // Las propuestas pendientes son de la conversación que se estaba mirando;
    // arrastrarlas a otra las mostraría fuera de su contexto.
    setPendingActions([]);
  }

  function nueva() {
    setMessages([]);
    setActiva(null);
    setPendingActions([]);
    setAdjuntas([]);
    setError(null);
  }

  async function borrar(id: string) {
    const res = await fetch(`/api/jarvis/conversaciones/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("No se pudo borrar la conversación.");
      return;
    }
    setConversaciones((prev) => prev.filter((c) => c.id !== id));
    // Si se borró la que estaba abierta, la pantalla vuelve a cero: seguir
    // mostrando los mensajes de algo que ya no existe invita a escribirle.
    if (activa === id) nueva();
  }

  async function resolveAction(id: string, decision: "approve" | "reject") {
    const res = await fetch(`/api/jarvis/actions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    setResolvedActionIds((prev) => new Set(prev).add(id));
    if (!res.ok && !data.ok) {
      setError(data.error ?? "No se pudo procesar la acción.");
    }
  }

  return (
    <div
      className="flex flex-1 overflow-hidden rounded border border-border bg-surface"
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        agregarArchivos(Array.from(e.dataTransfer.files));
      }}
    >
      <ListaChats
        conversaciones={conversaciones}
        activa={activa}
        onAbrir={abrir}
        onNueva={nueva}
        onBorrar={borrar}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* La barra de estado del chat.

            Dos cosas que faltaban. Una: qué está pasando —en línea, mirando la
            base, escribiendo— en un lugar fijo, en vez de una frase que aparece
            y desaparece al final del hilo.

            Y dos: QUÉ MODELO CONTESTA. Fabricio preguntó por WhatsApp "¿y con
            qué IA está conectado?" y la app no lo decía en ninguna parte: había
            que abrir el código para saberlo. Es una pregunta legítima de alguien
            que le va a creer lo que le diga. */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <span className="flex items-center gap-2 text-xs">
            <span className="relative flex h-2 w-2">
              {loading && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${loading ? "bg-accent" : "bg-good"}`}
              />
            </span>
            <span className="font-medium text-foreground">Jarvis</span>
            <span className="text-muted">
              {consultando
                ? `mirando ${consultando}`
                : loading
                  ? enCurso
                    ? "escribiendo"
                    : "pensando"
                  : "en línea"}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            {modelo}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {messages.length === 0 && !enCurso && (
            <p className="text-sm text-muted">
              Prueba preguntando: &ldquo;¿qué producto necesita revisión urgente?&rdquo; o
              &ldquo;¿cuánta utilidad dejó NIDA este mes?&rdquo; También puedes pegar o arrastrar una
              captura —del administrador de anuncios, de Shopify— y preguntarle qué ve.
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} className="flex max-w-[85%] gap-2.5 self-start">
                <MarcaJarvis />
                <div className="min-w-0 whitespace-pre-wrap rounded bg-surface-2 px-4 py-2 text-sm">
                  {m.content}
                </div>
              </div>
            ) : (
            <div
              key={i}
              className="max-w-[80%] self-end whitespace-pre-wrap rounded bg-accent px-4 py-2 text-sm text-white"
            >
              {m.vistas && m.vistas.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.vistas.map((src, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={j}
                      src={src}
                      alt="Captura adjunta"
                      className="max-h-40 rounded border border-white/20"
                    />
                  ))}
                </div>
              )}
              {m.content}
            </div>
            )
          )}

          {/* El turno en curso usa el mismo globo y la misma marca que los
              demás, para que no se vea un salto cuando termina y pasa a ser un
              mensaje guardado. */}
          {enCurso !== null && enCurso.length > 0 && (
            <div className="flex max-w-[85%] gap-2.5 self-start">
              <MarcaJarvis />
              <div className="min-w-0 whitespace-pre-wrap rounded bg-surface-2 px-4 py-2 text-sm">
                {enCurso}
                <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent align-middle" />
              </div>
            </div>
          )}

          {pendingActions
            .filter((a) => !resolvedActionIds.has(a.id))
            .map((a) => (
              <div
                key={a.id}
                className="max-w-[85%] self-start rounded border border-accent/40 bg-critical-bg/40 px-4 py-3 text-sm"
              >
                <p className="mb-1 font-mono text-xs uppercase tracking-wide text-accent-strong">
                  Propuesta pendiente &middot; {ACTION_LABEL[a.type] ?? a.type}
                </p>
                <p className="mb-3">{a.reason}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolveAction(a.id, "approve")}
                    className="rounded bg-good px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => resolveAction(a.id, "reject")}
                    className="rounded border border-border px-3 py-1.5 text-xs font-medium"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}

          {/* Mientras no hay NADA escrito todavía, el hilo también lo dice: la
              barra de arriba se lee cuando uno la busca, y acá es donde están
              los ojos después de apretar Enviar. Cuando ya sale texto no se
              repite — el texto es la prueba de que está trabajando. */}
          {loading && !enCurso && (
            <p className="flex items-center gap-2 self-start text-sm text-muted">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {consultando ? `Mirando ${consultando}…` : "Jarvis está pensando…"}
            </p>
          )}
          {error && <p className="self-start text-sm text-critical">{error}</p>}
          <div ref={finRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            preguntar(input);
          }}
          className={`flex flex-col gap-2 border-t p-3 transition-colors ${
            arrastrando ? "border-accent bg-accent/5" : "border-border"
          }`}
        >
          <VoiceMode
            onPregunta={preguntar}
            respuestaEnCurso={enCurso}
            ultimaRespuesta={
              [...messages].reverse().find((m) => m.role === "assistant")?.content ?? null
            }
            pensando={loading}
          />

          {adjuntas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {adjuntas.map((a, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.vistaPrevia}
                    alt={a.nombre}
                    className="h-16 w-16 rounded border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setAdjuntas((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Quitar ${a.nombre}`}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-[11px] font-bold leading-none text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={archivoRef}
              type="file"
              accept={TIPOS_ACEPTADOS.join(",")}
              multiple
              hidden
              onChange={(e) => {
                agregarArchivos(Array.from(e.target.files ?? []));
                // Se limpia el valor para poder volver a elegir el MISMO
                // archivo: sin esto, adjuntar, quitar y readjuntar no dispara
                // el evento y parece que el botón está roto.
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => archivoRef.current?.click()}
              disabled={adjuntas.length >= MAX_IMAGENES}
              title="Adjuntar una captura"
              aria-label="Adjuntar una captura"
              className="rounded border border-border px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:opacity-40"
            >
              {/* Un clip, dibujado para que acompañe el tamaño del texto. */}
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />
              </svg>
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={alPegar}
              placeholder={
                adjuntas.length > 0
                  ? "¿Qué querés que mire en la captura?"
                  : "Preguntale algo a Jarvis…"
              }
              className="flex-1 rounded border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * La marca de Jarvis al lado de cada respuesta.
 *
 * Un globo gris anónimo no se distingue de un campo de formulario: el hilo se
 * leía como una planilla con dos colores. La marca es un nodo con tres
 * conexiones, que es literalmente lo que Jarvis hace —juntar datos de varios
 * lados para contestar una cosa—.
 *
 * Dibujada acá y no traída como imagen: son doscientos bytes de SVG, no pide un
 * pedido más al servidor, y toma el color del tema sola.
 */
function MarcaJarvis() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 text-accent-strong"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <circle cx="8" cy="8" r="2.1" fill="currentColor" stroke="none" />
        <circle cx="3" cy="3.5" r="1.3" />
        <circle cx="13" cy="4.5" r="1.3" />
        <circle cx="4.5" cy="13" r="1.3" />
        <path d="M6.4 6.6 4 4.4M9.8 6.9 11.9 5.6M7.1 9.9 5.4 11.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}
