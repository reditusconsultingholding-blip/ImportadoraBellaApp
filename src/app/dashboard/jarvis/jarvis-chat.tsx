"use client";

import { useCallback, useState } from "react";
import VoiceMode from "./voice-mode";
import ListaChats from "./lista-chats";

type Message = { role: "user" | "assistant"; content: string };
type ProposedAction = { id: string; type: string; reason: string };
type Conversacion = { id: string; titulo: string; updatedAt: string };

const ACTION_LABEL: Record<string, string> = {
  PAUSE_CAMPAIGN: "Pausar campaña",
  RESUME_CAMPAIGN: "Reanudar campaña",
  SCALE_BUDGET: "Ajustar presupuesto",
};

export default function JarvisChat({ inicial }: { inicial: Conversacion[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingActions, setPendingActions] = useState<ProposedAction[]>([]);
  const [resolvedActionIds, setResolvedActionIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversaciones, setConversaciones] = useState<Conversacion[]>(inicial);
  const [activa, setActiva] = useState<string | null>(null);

  const cargarLista = useCallback(async () => {
    const res = await fetch("/api/jarvis/conversaciones");
    if (!res.ok) return;
    const data = await res.json();
    setConversaciones(data.conversaciones ?? []);
  }, []);

  // Preguntar por texto y preguntar por voz terminan en el mismo lugar: si
  // fueran dos caminos, el historial se les desincronizaría.
  async function preguntar(texto: string) {
    const limpio = texto.trim();
    if (!limpio || loading) return;

    const nextHistory = [...messages, { role: "user" as const, content: limpio }];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);
    setError(null);

    const res = await fetch("/api/jarvis/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: nextHistory, conversacionId: activa }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error inesperado.");
      return;
    }

    setMessages([...nextHistory, { role: "assistant", content: data.reply }]);
    if (data.conversacionId) setActiva(data.conversacionId);
    if (data.proposedActions?.length) {
      setPendingActions((prev) => [...prev, ...data.proposedActions]);
    }
    cargarLista();
  }

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
    <div className="flex flex-1 overflow-hidden rounded border border-border bg-surface">
      <ListaChats
        conversaciones={conversaciones}
        activa={activa}
        onAbrir={abrir}
        onNueva={nueva}
        onBorrar={borrar}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <p className="text-sm text-muted">
              Prueba preguntando: &ldquo;¿qué producto necesita revisión urgente?&rdquo; o
              &ldquo;¿cuánta utilidad dejó NIDA este mes?&rdquo;
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] whitespace-pre-wrap rounded px-4 py-2 text-sm ${
                m.role === "user" ? "self-end bg-accent text-white" : "self-start bg-surface-2"
              }`}
            >
              {m.content}
            </div>
          ))}

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

          {loading && <p className="self-start text-sm text-muted">Jarvis está pensando…</p>}
          {error && <p className="self-start text-sm text-critical">{error}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            preguntar(input);
          }}
          className="flex flex-col gap-2 border-t border-border p-3"
        >
          <VoiceMode
            onPregunta={preguntar}
            ultimaRespuesta={
              [...messages].reverse().find((m) => m.role === "assistant")?.content ?? null
            }
            pensando={loading}
          />
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Preguntale algo a Jarvis…"
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
