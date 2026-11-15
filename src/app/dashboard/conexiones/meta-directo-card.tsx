"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Girando } from "../navegar";

// Meta directo, sin Windsor (Fabrizio, 13-nov).
//
// Con el token guardado, Jarvis lee el gasto y las compras de Meta de su
// propia API cada 10 minutos, y deja de depender de que Windsor tenga cada
// cuenta conectada. TikTok sigue por Windsor. Ver meta-directo.ts.

export default function MetaDirectoCard({
  conectado,
  cuentas,
  desde,
}: {
  conectado: boolean;
  cuentas: number;
  desde: string | null;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vistas, setVistas] = useState<string[] | null>(null);

  async function guardar() {
    setTrabajando(true);
    setError(null);
    try {
      const res = await fetch("/api/meta/token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar.");
      setToken("");
      setVistas(j.cuentas ?? []);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setTrabajando(false);
    }
  }

  async function volverAWindsor() {
    if (!confirm("¿Volver a leer Meta por Windsor? Se borra el token guardado.")) return;
    setTrabajando(true);
    await fetch("/api/meta/token", { method: "DELETE" }).catch(() => null);
    setVistas(null);
    setTrabajando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            conectado ? "bg-good-bg text-good" : "bg-surface-2 text-muted"
          }`}
        >
          {conectado ? "Directo" : "Por Windsor"}
        </span>
        <span className="text-sm">
          {conectado
            ? `Meta se lee de su API cada 10 minutos · ${cuentas} ${cuentas === 1 ? "cuenta" : "cuentas"}${
                desde ? ` · desde el ${new Date(desde).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}` : ""
              }`
            : "Meta llega por Windsor. Con un token del Business Manager se lee directo y más al día."}
        </span>
      </div>

      {vistas && vistas.length > 0 && (
        <p className="rounded border border-good/30 bg-good-bg px-3 py-2 text-xs text-good">
          Conectado. Ve {vistas.length} {vistas.length === 1 ? "cuenta" : "cuentas"}: {vistas.join(", ")}. Los datos
          entran en la próxima vuelta (máximo 10 minutos).
        </p>
      )}

      {!conectado && (
        <ol className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted">
          <li>
            <strong className="text-foreground">1.</strong> En business.facebook.com → Configuración del negocio →{" "}
            <strong className="text-foreground">Apps</strong>: crear una app de tipo «Empresa» (o usar una que ya
            tengas) y agregarle el producto <strong className="text-foreground">Marketing API</strong>.
          </li>
          <li>
            <strong className="text-foreground">2.</strong> Usuarios → <strong className="text-foreground">Usuarios del sistema</strong> → Agregar
            (rol administrador). En «Asignar activos», darle <strong className="text-foreground">todas las cuentas
            publicitarias</strong> con permiso de ver rendimiento.
          </li>
          <li>
            <strong className="text-foreground">3.</strong> En ese usuario: <strong className="text-foreground">Generar token</strong>, elegir la app,
            vencimiento <strong className="text-foreground">Nunca</strong> y el permiso{" "}
            <code className="rounded bg-surface-2 px-1">ads_read</code>. Copiarlo y pegarlo acá.
          </li>
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={conectado ? "Pegar un token nuevo para reemplazarlo…" : "EAA…"}
          autoComplete="off"
          className="min-w-[16rem] flex-1 rounded border border-border bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={trabajando || !token.trim()}
          className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
        >
          {trabajando && <Girando />}
          {trabajando ? "Probando…" : conectado ? "Reemplazar" : "Conectar"}
        </button>
        {conectado && (
          <button
            type="button"
            onClick={volverAWindsor}
            disabled={trabajando}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground disabled:opacity-40"
          >
            Volver a Windsor
          </button>
        )}
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}
      <p className="text-[11px] text-muted">
        Antes de guardarlo se le pregunta a Meta qué cuentas ve: un token sin permiso o sin cuentas no entra. Se guarda
        cifrado. Las campañas, sus productos y las cuentas «vende por WhatsApp» siguen igual.
      </p>
    </div>
  );
}
