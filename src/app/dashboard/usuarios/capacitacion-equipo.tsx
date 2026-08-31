"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Quién hizo el recorrido guiado y quién no, y cómo volvérselo a mandar.
//
// Reiniciar no le borra nada a nadie: solo apaga la marca de "ya la vio", con
// lo cual la próxima vez que esa persona entre al panel el recorrido se le
// abre solo. Es lo que hace falta cuando cambia una pantalla y hay que
// recapacitar sin ir uno por uno pidiendo que la busquen.

type PersonaCapacitacion = {
  id: string;
  name: string;
  email: string;
  capacitacionVista: boolean;
};

export default function CapacitacionEquipo({
  personas,
  currentUserId,
}: {
  personas: PersonaCapacitacion[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [filas, setFilas] = useState(personas);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const pendientes = filas.filter((p) => !p.capacitacionVista).length;
  const hechas = filas.length - pendientes;

  async function reiniciar(cuerpo: { userId: string } | { todos: true }, clave: string) {
    setOcupado(clave);
    setError(null);
    setAviso(null);

    const res = await fetch("/api/capacitacion/reiniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(null);

    if (!res.ok) {
      setError(data.error ?? "No se pudo reiniciar la capacitación.");
      return;
    }

    const esTodos = "todos" in cuerpo;
    setFilas((prev) =>
      prev.map((p) =>
        esTodos || p.id === (cuerpo as { userId: string }).userId
          ? { ...p, capacitacionVista: false }
          : p
      )
    );
    setAviso(
      esTodos
        ? "Listo: a todo el equipo le va a volver a salir la capacitación al entrar."
        : "Listo: le va a volver a salir la próxima vez que entre."
    );
    // El propio encabezado del panel muestra el recorrido pendiente, así que
    // si el dueño se reinició a sí mismo hay que volver a pedir el layout.
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-semibold">Capacitación en la plataforma</h2>
        <p className="mt-1 text-sm text-muted">
          El recorrido guiado le muestra a cada persona, según su rol, para qué sirve cada
          sección. Se abre solo la primera vez que entra. {hechas} de {filas.length} ya lo
          {hechas === 1 ? " hizo" : " hicieron"}.
        </p>
      </div>

      {error && (
        <p className="rounded border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}
      {aviso && (
        <p className="rounded border border-good/25 bg-good-bg px-3 py-2 text-sm text-good">
          {aviso}
        </p>
      )}

      <div className="overflow-hidden rounded border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-3">Persona</th>
              <th className="px-5 py-3">Capacitación</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-5 py-3">
                  <p className="font-medium">
                    {p.name}
                    {p.id === currentUserId && <span className="font-normal text-muted"> (tú)</span>}
                  </p>
                  <p className="text-xs text-muted">{p.email}</p>
                </td>
                <td className="px-5 py-3">
                  {p.capacitacionVista ? (
                    <span className="rounded bg-good-bg px-2 py-1 text-xs text-good">Hecha</span>
                  ) : (
                    <span className="rounded bg-pending-bg px-2 py-1 text-xs text-warning">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {/* A quien la tiene pendiente no hay nada que reiniciarle:
                      el recorrido ya le va a salir al entrar. */}
                  {p.capacitacionVista && (
                    <button
                      type="button"
                      onClick={() => reiniciar({ userId: p.id }, p.id)}
                      disabled={ocupado !== null}
                      className="rounded border border-border px-2.5 py-1 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-60"
                    >
                      {ocupado === p.id ? "Reiniciando…" : "Volver a mandársela"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => reiniciar({ todos: true }, "todos")}
        disabled={ocupado !== null || hechas === 0}
        className="self-start rounded border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-50"
      >
        {ocupado === "todos" ? "Reiniciando…" : "Reiniciarla para todo el equipo"}
      </button>
      <p className="text-xs text-muted">
        Úsalo cuando cambie una pantalla y haga falta que todos vuelvan a verla. Nadie pierde
        nada: solo se les abre el recorrido de nuevo la próxima vez que entren.
      </p>
    </section>
  );
}
