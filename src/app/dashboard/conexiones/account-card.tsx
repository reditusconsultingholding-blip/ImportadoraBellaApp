"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLATFORM_LABEL: Record<string, string> = {
  META: "Meta (Facebook + Instagram)",
  TIKTOK: "TikTok",
};

/** «2026-10-16» como «16 oct». Se arma a mano: `new Date("2026-10-16")` lo lee
    como medianoche UTC, y en Ecuador eso es el día anterior a las 7 de la tarde. */
function fechaCorta(dia: string) {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [, mes, d] = dia.split("-");
  return `${Number(d)} ${MESES[Number(mes) - 1] ?? mes}`;
}

const ID_LABEL: Record<string, string> = {
  META: "Ad Account ID (ej. act_1234567890)",
  TIKTOK: "Advertiser ID",
};

export default function AccountCard({
  id,
  platform,
  name,
  externalId,
  connected,
  ultimoDia,
  diasSinDatos,
  callada,
  ciega,
  gasto7d,
  caida,
  apagadaAdrede,
  ventaFueraDeLaWeb,
}: {
  id: string;
  platform: string;
  name: string;
  externalId: string;
  connected: boolean;
  /** El último día del que llegaron números (YYYY-MM-DD). */
  ultimoDia: string | null;
  diasSinDatos: number | null;
  /** Venía gastando y dejó de entregar datos. */
  callada: boolean;
  /** Gasta y no registra ninguna compra. */
  ciega: boolean;
  gasto7d: number;
  /** Dejó de entregar datos, aunque alguien haya callado el aviso. */
  caida: boolean;
  /** Alguien declaró que está apagada a propósito. */
  apagadaAdrede: boolean;
  /** Alguien declaró que vende por WhatsApp. */
  ventaFueraDeLaWeb: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!connected);
  const [accountId, setAccountId] = useState(connected ? externalId : "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "warn" | "error"; text: string } | null>(
    null
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const res = await fetch(`/api/accounts/${id}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId: accountId, accessToken: token }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "No se pudo guardar." });
      return;
    }
    if (!data.synced) {
      setMessage({ type: "warn", text: data.warning ?? "Se guardó, pero no se pudo sincronizar todavía." });
    } else {
      setMessage({ type: "ok", text: "Conectado y sincronizado." });
    }
    router.refresh();
  }

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/accounts/${id}/sync`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    // El servidor contesta si ESTA cuenta vino en la respuesta de Windsor, y
    // ese es el dato que importa: «sincronizado» a secas, con una cuenta que
    // Windsor dejó de entregar, es la respuesta que hace perder la tarde.
    setMessage(
      !res.ok
        ? { type: "error", text: data.error ?? "Falló la sincronización." }
        : data.vino === false
          ? { type: "error", text: data.mensaje }
          : { type: "ok", text: data.mensaje ?? "Sincronizado." }
    );
    router.refresh();
  }

  // Deshacer el silencio. Tiene que estar a la vista: si callar un aviso no se
  // puede revertir desde la misma pantalla, nadie se anima a callarlo y el
  // tablero se queda en rojo para siempre, que es como se aprende a ignorarlo.
  async function volverAVigilar() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/accounts/${id}/vigilancia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "vigilar" }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: data.error ?? "No se pudo guardar." });
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!confirm("¿Eliminar esta cuenta pendiente?")) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: data.error ?? "No se pudo eliminar." });
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-surface border border-border rounded p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted">{PLATFORM_LABEL[platform] ?? platform}</p>
        </div>
        {/* EL ESTADO ES CUANDO LLEGARON LOS ULTIMOS NUMEROS, NO SI ALGUIEN
            LA DIO DE ALTA.
            //
            // «Conectada» solo quería decir que la cuenta existe en la lista.
            // El 16 de octubre cuatro cuentas de Meta llevaban días sin
            // entregar una sola fila —una de ellas la que más gastaba— y las
            // doce mostraban el mismo cartel verde. Esta es la pantalla a la
            // que uno viene a comprobar justamente eso. */}
        <span
          className={`font-mono text-xs px-2 py-1 rounded text-right ${
            callada
              ? "bg-critical-bg text-critical"
              : ciega
                ? "bg-pending-bg text-warning"
                : apagadaAdrede || ventaFueraDeLaWeb
                  ? "bg-surface-2 text-muted"
                  : ultimoDia
                    ? "bg-good-bg text-good"
                    : "bg-pending-bg text-muted"
          }`}
          title={ultimoDia ? `Último día con números: ${ultimoDia}` : undefined}
        >
          {callada
            ? `Sin datos hace ${diasSinDatos} días`
            : ciega
              ? "Sin compras registradas"
              : apagadaAdrede
                ? "Apagada a propósito"
                : ventaFueraDeLaWeb
                  ? "Vende por WhatsApp"
                  : ultimoDia
                    ? `Al día · ${fechaCorta(ultimoDia)}`
                    : connected
                      ? "Nunca trajo datos"
                      : "Pendiente"}
        </span>
      </div>

      {callada && (
        <p className="mt-3 text-xs leading-relaxed text-critical">
          Venía gastando y dejó de entregar números. La cuenta sigue corriendo en la plataforma; lo que se
          cortó es lo que Windsor nos manda. Hay que reconectarla en Windsor.ai —el panel la muestra
          incompleta hasta que vuelva.
        </p>
      )}

      {ciega && !callada && (
        <p className="mt-3 text-xs leading-relaxed text-warning">
          Gastó ${Math.round(gasto7d)} en los últimos siete días y no registró ni una compra. Su gasto entra en
          el total y sus ventas no, así que el CPA general sale peor del que es. Si son campañas a WhatsApp, la
          venta ocurre fuera de la web y el píxel no tiene cómo verla; si no, hay que revisar el píxel de esta
          cuenta.
        </p>
      )}

      {/* Por qué esta cuenta no avisa. Dentro de un mes, la pregunta «¿y esta
          por qué está en gris?» tiene que tener respuesta en la pantalla. */}
      {(apagadaAdrede || ventaFueraDeLaWeb) && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs leading-relaxed text-muted">
            {apagadaAdrede
              ? caida
                ? "Alguien del equipo marcó esta cuenta como apagada a propósito, así que no entrega datos y no avisa. Si vuelve a entregarlos, la marca se levanta sola."
                : "Está marcada como apagada a propósito. Hoy sí está entregando datos, así que la marca se va a levantar sola en la próxima vuelta del reloj."
              : "Alguien del equipo marcó que esta cuenta vende por WhatsApp: la venta se cierra en el chat y el píxel no puede verla, así que no se espera que registre compras. Si registra una por la web, la marca se levanta sola."}
          </p>
          <button
            onClick={volverAVigilar}
            disabled={busy}
            className="self-start text-xs text-accent hover:underline disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Volver a vigilarla"}
          </button>
        </div>
      )}

      {connected && !open && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={syncNow}
            disabled={busy}
            className="text-xs font-medium border border-border rounded px-3 py-1.5 disabled:opacity-60"
          >
            {busy ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-muted hover:text-foreground transition"
          >
            Cambiar token
          </button>
        </div>
      )}

      {open && (
        <form onSubmit={save} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              {ID_LABEL[platform] ?? "ID de cuenta"}
            </span>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              Access token
            </span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              required
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
              placeholder="pegar el token de larga duración aquí"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="text-xs font-medium bg-accent text-white rounded px-3 py-1.5 disabled:opacity-60"
            >
              {busy ? "Guardando…" : "Guardar y sincronizar"}
            </button>
            {connected && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted hover:text-foreground transition"
              >
                Cancelar
              </button>
            )}
            {!connected && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="text-xs text-critical hover:underline disabled:opacity-60"
              >
                Eliminar
              </button>
            )}
          </div>
        </form>
      )}

      {message && (
        <p
          className={`text-xs mt-3 ${
            message.type === "ok" ? "text-good" : message.type === "warn" ? "text-accent-strong" : "text-critical"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
