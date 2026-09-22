"use client";

// Los nombres del tablero que no son de nadie, con la forma de arreglarlo al
// lado.
//
// Antes esto era un aviso amarillo que decía "anótalo en Usuarios › editar ›
// «Cómo aparece en el tablero»": tres pantallas de distancia para resolver
// algo que se ve desde acá, y Emilia —que es quien lo ve— dijo directamente
// que no sabría cómo hacerlo. Ahora se elige a la persona en el desplegable y
// listo; si es alguien nuevo de verdad, se le crea la cuenta sin salir.

import { useEffect, useState } from "react";

type Usuario = { id: string; name: string; role: string; apodos: string[] };

export default function SumarIntegrante({
  sinEnlazar,
  onListo,
}: {
  sinEnlazar: { nombre: string; tareas: number }[];
  /** Para volver a pedir el rendimiento cuando el trabajo ya tiene dueño. */
  onListo: () => void;
}) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const [elegido, setElegido] = useState<Record<string, string>>({});
  const [correo, setCorreo] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; malo: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/contenido/integrantes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return;
        setUsuarios(d.usuarios ?? []);
        setPuedeCrear(Boolean(d.puedeCrear));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  async function enlazar(nombre: string) {
    const userId = elegido[nombre];
    setGuardando(nombre);
    setAviso(null);
    try {
      const res = await fetch("/api/contenido/integrantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          userId === "nueva"
            ? { nombre, email: correo[nombre]?.trim(), rol: "EDITOR" }
            : { nombre, userId },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar.");
      setAviso({
        texto: d.claveTemporal
          ? `${d.nombre} ya está en el equipo. Su clave para entrar la primera vez es ${d.claveTemporal} — pásasela y que la cambie al entrar.`
          : `Listo: el trabajo a nombre de "${nombre}" ahora se le cuenta a ${d.nombre}.`,
        malo: false,
      });
      onListo();
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : "No se pudo guardar.", malo: true });
    } finally {
      setGuardando(null);
    }
  }

  if (sinEnlazar.length === 0) return null;

  return (
    <section className="rounded border border-warning bg-pending-bg px-3 py-2.5">
      <p className="text-xs font-medium text-warning">
        Hay trabajo cargado a nombre de alguien que todavía no es parte del equipo acá dentro.
        Mientras tanto no se le suma a nadie.
      </p>

      <ul className="mt-2 flex flex-col gap-2">
        {sinEnlazar.map((s) => {
          const valor = elegido[s.nombre] ?? "";
          const creando = valor === "nueva";
          return (
            <li key={s.nombre} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[9rem] text-sm font-medium text-foreground">
                {s.nombre}
                <span className="ml-1 text-xs font-normal text-muted">
                  {s.tareas} {s.tareas === 1 ? "tarea" : "tareas"}
                </span>
              </span>

              <select
                value={valor}
                onChange={(e) => setElegido((x) => ({ ...x, [s.nombre]: e.target.value }))}
                aria-label={`A quién pertenece el trabajo de ${s.nombre}`}
                className="rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
              >
                <option value="">¿Quién es?</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
                {puedeCrear && <option value="nueva">— Es alguien nuevo, crearle la cuenta —</option>}
              </select>

              {creando && (
                <input
                  type="email"
                  value={correo[s.nombre] ?? ""}
                  onChange={(e) => setCorreo((x) => ({ ...x, [s.nombre]: e.target.value }))}
                  placeholder="correo de la persona"
                  className="w-56 rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
                />
              )}

              <button
                type="button"
                disabled={!valor || guardando === s.nombre || (creando && !correo[s.nombre]?.trim())}
                onClick={() => enlazar(s.nombre)}
                className="rounded border border-accent bg-good-bg px-2.5 py-1 text-xs font-medium text-accent-strong transition hover:brightness-95 disabled:opacity-40"
              >
                {guardando === s.nombre ? "Guardando…" : creando ? "Crear y sumar" : "Es esta persona"}
              </button>
            </li>
          );
        })}
      </ul>

      {aviso && (
        <p className={`mt-2 text-xs ${aviso.malo ? "text-critical" : "text-good"}`}>{aviso.texto}</p>
      )}

      {!puedeCrear && (
        <p className="mt-2 text-[11px] text-muted">
          Si la persona todavía no tiene cuenta, pedísela al administrador: crear cuentas no es
          algo que se pueda hacer desde acá.
        </p>
      )}
    </section>
  );
}
