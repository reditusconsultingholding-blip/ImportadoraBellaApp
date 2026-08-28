"use client";

import { useEffect, useState } from "react";

// El interruptor de las notificaciones push.
//
// El permiso lo da el navegador y no se puede pedir sin un clic de la persona,
// así que esto tiene que ser un botón — no algo que se active solo al entrar.

function base64ABytes(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(normal);
  return Uint8Array.from([...crudo].map((c) => c.charCodeAt(0)));
}

export default function PushToggle() {
  const [estado, setEstado] = useState<
    "cargando" | "no-soportado" | "sin-configurar" | "apagado" | "encendido" | "bloqueado"
  >("cargando");
  const [clave, setClave] = useState<string | null>(null);
  const [dispositivos, setDispositivos] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    const soportado =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    fetch("/api/push")
      .then((r) => r.json())
      .then(async (d) => {
        if (cancelado) return;
        if (!soportado) return setEstado("no-soportado");
        if (!d.disponible || !d.clavePublica) return setEstado("sin-configurar");

        setClave(d.clavePublica);
        setDispositivos(d.dispositivos ?? 0);

        if (Notification.permission === "denied") return setEstado("bloqueado");

        // Que haya suscripción en el navegador Y registro en el servidor son
        // dos cosas distintas: se puede haber borrado una sin la otra.
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          setEstado(sub && (d.dispositivos ?? 0) > 0 ? "encendido" : "apagado");
        } catch {
          setEstado("apagado");
        }
      })
      .catch(() => {
        if (!cancelado) setEstado("sin-configurar");
      });

    return () => {
      cancelado = true;
    };
  }, []);

  async function encender() {
    if (!clave) return;
    setOcupado(true);
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "apagado");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ABytes(clave),
      });

      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "No se pudo registrar el dispositivo.");
        return;
      }

      setEstado("encendido");
      setDispositivos((n) => n + 1);
    } catch {
      setError("No se pudo activar. Revisa que la página esté en https.");
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
        await sub.unsubscribe();
      } else {
        await fetch("/api/push", { method: "DELETE" });
      }
      setEstado("apagado");
      setDispositivos(0);
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "cargando") return null;

  const mensaje =
    estado === "no-soportado"
      ? "Este navegador no soporta avisos push."
      : estado === "sin-configurar"
        ? "Los avisos push todavía no están configurados en el servidor."
        : estado === "bloqueado"
          ? "El navegador tiene bloqueados los avisos de este sitio. Hay que habilitarlos desde la barra de direcciones."
          : null;

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Avisos en el celular y la computadora</p>
          <p className="text-xs text-muted">
            {mensaje ??
              (estado === "encendido"
                ? `Activados en ${dispositivos} ${dispositivos === 1 ? "dispositivo" : "dispositivos"}. Te avisamos cuando haya algo que decidir, aunque no tengas la app abierta.`
                : "Recibe los avisos aunque no tengas la app abierta. Es lo que separa una alerta útil de una que se lee tres horas tarde.")}
          </p>
        </div>

        {(estado === "apagado" || estado === "encendido") && (
          <button
            onClick={estado === "encendido" ? apagar : encender}
            disabled={ocupado}
            className={`shrink-0 rounded px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
              estado === "encendido"
                ? "border border-border text-muted hover:border-critical hover:text-critical"
                : "bg-accent text-white hover:bg-accent-strong"
            }`}
          >
            {ocupado ? "…" : estado === "encendido" ? "Desactivar" : "Activar avisos"}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
    </div>
  );
}
