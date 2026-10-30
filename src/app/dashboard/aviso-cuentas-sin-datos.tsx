"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pasosParaCuentaSinCompras, pasosParaReconectar } from "@/lib/pasos-reconectar";

/**
 * El aviso de que UNA cuenta publicitaria dejó de entregar datos, o entrega
 * todo menos ventas. Con el paso a paso adentro.
 *
 * POR QUÉ EN EL TABLERO Y NO SOLO EN CONEXIONES. El 16 de octubre una cuenta
 * —la que más gastaba de las doce— llevaba cuatro días sin entregar una fila, y
 * el equipo se enteró porque Emilia se extrañó de que un producto marcara una
 * compra cuando el administrador de anuncios marcaba veintidós. La alarma ya
 * existía para entonces, pero vivía en Conexiones y en el detalle del reloj:
 * dos pantallas a las que se entra cuando ya se sospecha algo. El aviso tiene
 * que estar donde se lee el CPA, porque el daño no es quedarse sin un dato: es
 * decidir con un número que está mejor de lo que es.
 *
 * Y POR QUÉ EL PASO A PASO ADENTRO. Un aviso que dice «revisá la conexión en
 * Windsor» obliga a buscar a alguien que sepa cómo. Los siete pasos están acá
 * mismo, con el nombre y el número de la cuenta que se cayó, y vienen del mismo
 * módulo que el documento que se le entregó al equipo: si se mejora un paso, se
 * mejora en los dos lados.
 */

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «2026-10-21» → «21 de octubre». Armado a mano: `new Date("2026-10-21")` es
    medianoche UTC, y en Ecuador eso cae el día anterior. */
function enPalabras(dia: string) {
  const [, mes, d] = dia.split("-");
  return `${Number(d)} de ${MESES[Number(mes) - 1] ?? mes}`;
}

export type CuentaAvisada = {
  id: string;
  nombre: string;
  platform: "META" | "TIKTOK";
  externalId: string;
  ultimoDia: string | null;
  diasSinDatos: number | null;
  callada: boolean;
  ciega: boolean;
  gasto7d: number;
  gastoDiarioPrevio: number | null;
};

export default function AvisoCuentasSinDatos({
  cuentas,
  verCifras,
  puedeMarcar,
}: {
  cuentas: CuentaAvisada[];
  /** Sin permiso para ver dinero no se nombra el gasto, pero sí el problema. */
  verCifras: boolean;
  /** Solo quien administra conexiones puede declarar una cuenta apagada. */
  puedeMarcar: boolean;
}) {
  const router = useRouter();
  const sinDatos = cuentas.filter((c) => c.callada);
  const sinCompras = cuentas.filter((c) => c.ciega);
  if (sinDatos.length === 0 && sinCompras.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {sinDatos.map((c) => (
        <TarjetaCuenta
          key={c.id}
          cuenta={c}
          tipo="sin-datos"
          verCifras={verCifras}
          puedeMarcar={puedeMarcar}
          alGuardar={() => router.refresh()}
        />
      ))}
      {sinCompras.map((c) => (
        <TarjetaCuenta
          key={c.id}
          cuenta={c}
          tipo="sin-compras"
          verCifras={verCifras}
          puedeMarcar={puedeMarcar}
          alGuardar={() => router.refresh()}
        />
      ))}
    </div>
  );
}

/**
 * Una tarjeta, que no sabe nada del router.
 *
 * El refresco entra como prop para poder renderizar esto en una prueba: lo que
 * importa de este componente es el texto —qué número no hay que creer y qué
 * hacer—, y el texto se rompe de maneras que la compilación no ve (un
 * «undefined» donde iba la fecha, una rama que deja de dibujarse). Con
 * `useRouter` adentro no hay forma de renderizarlo fuera de Next.
 */
export function TarjetaCuenta({
  cuenta,
  tipo,
  verCifras,
  puedeMarcar,
  alGuardar,
}: {
  cuenta: CuentaAvisada;
  tipo: "sin-datos" | "sin-compras";
  verCifras: boolean;
  puedeMarcar: boolean;
  alGuardar: () => void;
}) {
  const grave = tipo === "sin-datos";
  // La cuenta caída abre los pasos sin que haya que pedirlos: es el caso raro,
  // urgente y caro, y nadie en el equipo sabe de memoria cómo se arregla.
  // Ocupa media pantalla a propósito — el CPA de abajo está mal mientras esto
  // siga, y no debería poder leerse sin pasar por acá. La cuenta que gasta sin
  // registrar compras arranca cerrada: es menos urgente y suele convivir días.
  const [abierto, setAbierto] = useState(grave);
  const [marcando, setMarcando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conector = cuenta.platform === "META" ? "Facebook Ads" : "TikTok Ads";
  const pasos = grave
    ? pasosParaReconectar({
        nombre: cuenta.nombre,
        externalId: cuenta.externalId,
        ultimoDia: cuenta.ultimoDia ? enPalabras(cuenta.ultimoDia) : "el último día que trajo datos",
        conector,
      })
    : pasosParaCuentaSinCompras(cuenta.nombre);

  async function marcar(accion: "apagada" | "vende-por-whatsapp") {
    setMarcando(true);
    setError(null);
    const res = await fetch(`/api/accounts/${cuenta.id}/vigilancia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion }),
    });
    setMarcando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar. Intenta de nuevo.");
      return;
    }
    alGuardar();
  }

  return (
    <div
      className={`rounded border px-4 py-3 ${
        grave ? "border-critical/50 bg-critical-bg/60" : "border-warning/40 bg-pending-bg"
      }`}
    >
      <p className={`flex items-center gap-2 text-sm font-medium ${grave ? "text-critical" : "text-warning"}`}>
        <span className="relative flex h-2 w-2 shrink-0">
          {grave && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical opacity-70" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${grave ? "bg-critical" : "bg-warning"}`}
          />
        </span>
        {grave ? (
          <span>
            {cuenta.nombre} no está entregando datos
            {cuenta.ultimoDia ? ` desde el ${enPalabras(cuenta.ultimoDia)}` : ""}
            {cuenta.diasSinDatos != null ? ` · ${cuenta.diasSinDatos} días` : ""}
          </span>
        ) : (
          <span>{cuenta.nombre} gasta y no registra ninguna compra</span>
        )}
      </p>

      {/* Qué número de los de abajo no hay que creer. Es lo que convierte el
          aviso técnico en uno de negocio: «la cuenta no entrega datos» se
          posterga, «el CPA que estás viendo está mejor de lo que es» no. */}
      <p className="mt-1 text-sm text-muted">
        {grave && verCifras && cuenta.gastoDiarioPrevio != null && (
          <>
            Lo último que se le alcanzó a ver fueron unos{" "}
            <span className="text-foreground">{money(cuenta.gastoDiarioPrevio)} por día</span>. Lo
            que haya gastado desde entonces no está en estos números y desde acá no hay forma de
            saberlo: hay que mirarlo en el administrador de anuncios. Mientras siga así, el CPA y la
            utilidad de abajo salen <span className="text-foreground">mejores que los reales</span>,
            porque las ventas de esta cuenta están en la tienda y su gasto no.
          </>
        )}
        {grave && (!verCifras || cuenta.gastoDiarioPrevio == null) && (
          <>
            Sus números están quietos desde entonces. No es que no haya pasado nada en esa cuenta:
            no está llegando.
          </>
        )}
        {!grave && verCifras && (
          <>
            Gastó <span className="text-foreground">{money(cuenta.gasto7d)} en los últimos 7 días</span>{" "}
            y registró <span className="text-foreground">cero compras</span>. Su gasto entra en el
            total y sus ventas no, así que el CPA general sale{" "}
            <span className="text-foreground">peor del que es</span>. Puede ser que venda por
            WhatsApp —y entonces no hay nada roto— o que le falte el píxel.
          </>
        )}
        {!grave && !verCifras && (
          <>
            Esta cuenta gasta todos los días y no registra ninguna compra. Puede ser que venda por
            WhatsApp —y entonces no hay nada roto— o que le falte el píxel.
          </>
        )}
      </p>

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="mt-2 text-xs text-accent hover:underline"
      >
        {abierto ? "Ocultar los pasos" : grave ? "Cómo se arregla, paso a paso" : "Cómo se averigua, paso a paso"}
      </button>

      {abierto && (
        <ol className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {pasos.map((p, i) => (
            <li key={p.titulo} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-xs text-muted">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-medium text-foreground">{p.titulo}</p>
                <p className="text-muted">{p.cuerpo}</p>
                {p.seVeAsi && (
                  <p className="text-xs text-muted">
                    <span className="text-foreground">Se ve así: </span>
                    {p.seVeAsi}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* El botón que cierra el aviso sin que nadie tenga que entrar al código.
          Lo que calla la alarma es una decisión declarada, nunca el paso del
          tiempo: por eso el texto dice qué se está declarando. */}
      {puedeMarcar && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <button
            type="button"
            disabled={marcando}
            onClick={() => marcar(grave ? "apagada" : "vende-por-whatsapp")}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground disabled:opacity-50"
          >
            {marcando
              ? "Guardando…"
              : grave
                ? "Esta cuenta está apagada a propósito"
                : "Son campañas a WhatsApp"}
          </button>
          <span className="text-xs text-muted">
            {grave
              ? "El aviso se calla hasta que la cuenta vuelva a entregar datos."
              : "El aviso se calla hasta que registre una compra por la web."}
          </span>
          {error && <span className="text-xs text-critical">{error}</span>}
        </div>
      )}
    </div>
  );
}
