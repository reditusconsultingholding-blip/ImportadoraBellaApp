"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type ProposedAction = { id: string; type: string; reason: string };

const ACTION_LABEL: Record<string, string> = {
  PAUSE_CAMPAIGN: "Pausar campaña",
  RESUME_CAMPAIGN: "Reanudar campaña",
  SCALE_BUDGET: "Ajustar presupuesto",
};

export default function JarvisChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingActions, setPendingActions] = useState<ProposedAction[]>([]);
  const [resolvedActionIds, setResolvedActionIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const nextHistory = [...messages, { role: "user" as const, content: input }];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);
    setError(null);

    const res = await fetch("/api/jarvis/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: nextHistory }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error inesperado.");
      return;
    }

    setMessages([...nextHistory, { role: "assistant", content: data.reply }]);
    if (data.proposedActions?.length) {
      setPendingActions((prev) => [...prev, ...data.proposedActions]);
    }
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
    <div className="flex flex-col flex-1 bg-surface border border-border rounded overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted">
            Prueba preguntando: &ldquo;¿qué producto necesita revisión urgente?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded px-4 py-2 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "self-end bg-accent text-white"
                : "self-start bg-surface-2"
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
              className="self-start max-w-[85%] border border-accent/40 bg-critical-bg/40 rounded px-4 py-3 text-sm"
            >
              <p className="font-mono text-xs uppercase tracking-wide text-accent-strong mb-1">
                Propuesta pendiente &middot; {ACTION_LABEL[a.type] ?? a.type}
              </p>
              <p className="mb-3">{a.reason}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => resolveAction(a.id, "approve")}
                  className="text-xs font-medium bg-good text-white rounded px-3 py-1.5"
                >
                  Aprobar
                </button>
                <button
                  onClick={() => resolveAction(a.id, "reject")}
                  className="text-xs font-medium border border-border rounded px-3 py-1.5"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}

        {loading && <p className="text-sm text-muted self-start">Jarvis está pensando…</p>}
        {error && <p className="text-sm text-critical self-start">{error}</p>}
      </div>

      <form onSubmit={send} className="border-t border-border p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Preguntale algo a Jarvis…"
          className="flex-1 border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-accent text-white text-sm font-medium rounded px-4 py-2 disabled:opacity-60"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
