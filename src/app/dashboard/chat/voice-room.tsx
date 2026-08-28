"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Sala de voz de un canal, al estilo Discord: se entra y se escucha a todos.
//
// El audio va DIRECTO de un navegador a otro (WebRTC en malla). Por el servidor
// solo pasa el saludo inicial — quién está adentro y los mensajes de
// negociación. No hay servidor de medios ni WebSocket: se consulta cada dos
// segundos, que para un equipo de diez personas alcanza de sobra y evita montar
// infraestructura nueva.
//
// Límite conocido: solo hay servidores STUN, no TURN. En la mayoría de las
// redes alcanza, pero detrás de un NAT simétrico —algunas redes corporativas y
// ciertos datos móviles— la conexión directa no se puede armar y esa persona
// no va a escuchar. Cuando pasa, la pantalla lo dice en vez de quedarse muda
// sin explicación.

const STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const LATIDO_MS = 2000;

type Participante = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  muted: boolean;
};

type Senal = { to: string; payload: unknown };

function iniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function VoiceRoom({
  channelId,
  channelName,
  yo,
}: {
  channelId: string;
  channelName: string;
  yo: { id: string; name: string };
}) {
  const [dentro, setDentro] = useState(false);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [mudo, setMudo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hablando, setHablando] = useState<Set<string>>(new Set());

  const micRef = useRef<MediaStream | null>(null);
  const conexiones = useRef(new Map<string, RTCPeerConnection>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const salientes = useRef<Senal[]>([]);
  const dentroRef = useRef(false);

  const encolar = useCallback((to: string, payload: unknown) => {
    salientes.current.push({ to, payload });
  }, []);

  /** Cierra todo y suelta el micrófono. */
  const desconectar = useCallback(() => {
    dentroRef.current = false;
    for (const pc of conexiones.current.values()) pc.close();
    conexiones.current.clear();
    for (const a of audios.current.values()) {
      a.srcObject = null;
      a.remove();
    }
    audios.current.clear();
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    salientes.current = [];
    setParticipantes([]);
    setHablando(new Set());
  }, []);

  /** Detecta quién está hablando, para marcarlo en pantalla. */
  const escucharVolumen = useCallback((id: string, stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const fuente = ctx.createMediaStreamSource(stream);
      const analizador = ctx.createAnalyser();
      analizador.fftSize = 512;
      fuente.connect(analizador);
      const datos = new Uint8Array(analizador.frequencyBinCount);

      const medir = () => {
        if (!dentroRef.current) {
          ctx.close().catch(() => {});
          return;
        }
        analizador.getByteFrequencyData(datos);
        const nivel = datos.reduce((a, b) => a + b, 0) / datos.length;
        setHablando((prev) => {
          const activo = nivel > 12;
          if (activo === prev.has(id)) return prev;
          const next = new Set(prev);
          if (activo) next.add(id);
          else next.delete(id);
          return next;
        });
        requestAnimationFrame(medir);
      };
      medir();
    } catch {
      // Sin medidor de volumen la sala funciona igual; solo no se marca quién
      // está hablando.
    }
  }, []);

  /**
   * Arma (o recupera) la conexión con una persona.
   *
   * Quién ofrece y quién responde se decide comparando los identificadores:
   * si los dos ofrecieran a la vez, las dos negociaciones se pisarían y no se
   * conectaría ninguna.
   */
  const conexionCon = useCallback(
    (otroId: string) => {
      const existente = conexiones.current.get(otroId);
      if (existente) return existente;

      const pc = new RTCPeerConnection({ iceServers: STUN });
      conexiones.current.set(otroId, pc);

      micRef.current?.getTracks().forEach((t) => pc.addTrack(t, micRef.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) encolar(otroId, { tipo: "ice", candidate: e.candidate.toJSON() });
      };

      pc.ontrack = (e) => {
        let audio = audios.current.get(otroId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audios.current.set(otroId, audio);
        }
        audio.srcObject = e.streams[0];
        audio.play().catch(() => {
          // Algunos navegadores exigen un gesto del usuario antes de reproducir.
          // Entrar a la sala ya es uno, así que esto casi nunca cae acá.
        });
        escucharVolumen(otroId, e.streams[0]);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          setError(
            "No se pudo abrir el audio con alguien de la sala. Suele pasar en redes que bloquean las conexiones directas."
          );
        }
      };

      return pc;
    },
    [encolar, escucharVolumen]
  );

  async function entrar() {
    setError(null);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micRef.current = mic;
      dentroRef.current = true;
      setDentro(true);
    } catch {
      setError(
        "No se pudo usar el micrófono. Hay que darle permiso al navegador, y la página tiene que estar en https."
      );
    }
  }

  function salir() {
    desconectar();
    setDentro(false);
    fetch("/api/chat/voz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, accion: "salir" }),
    }).catch(() => {});
  }

  // Silenciar corta el audio en origen: la pista sigue abierta pero no manda
  // nada. Cerrarla obligaría a renegociar con cada persona de la sala.
  useEffect(() => {
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !mudo));
  }, [mudo]);

  // El latido: dice "sigo acá", manda lo que haya en la cola y trae lo que
  // llegó. Todo en un solo pedido cada dos segundos.
  useEffect(() => {
    if (!dentro) return;
    let vivo = true;

    const latir = async () => {
      const aEnviar = salientes.current;
      salientes.current = [];
      try {
        const res = await fetch("/api/chat/voz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, accion: "latir", muted: mudo, senales: aEnviar }),
        });
        if (!res.ok || !vivo) return;
        const d = (await res.json()) as {
          participantes: Participante[];
          recibidas: { from: string; payload: Record<string, unknown> }[];
        };
        setParticipantes(d.participantes);

        // Primero se procesa lo que llegó, después se abren las conexiones
        // nuevas: si se hiciera al revés, una oferta recién recibida podría
        // chocar con otra que se acaba de crear.
        for (const s of d.recibidas) {
          const pc = conexionCon(s.from);
          const p = s.payload as { tipo: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
          try {
            if (p.tipo === "oferta" && p.sdp) {
              await pc.setRemoteDescription(p.sdp);
              const respuesta = await pc.createAnswer();
              await pc.setLocalDescription(respuesta);
              encolar(s.from, { tipo: "respuesta", sdp: respuesta });
            } else if (p.tipo === "respuesta" && p.sdp) {
              if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(p.sdp);
              }
            } else if (p.tipo === "ice" && p.candidate) {
              await pc.addIceCandidate(p.candidate);
            }
          } catch {
            // Una señal fuera de orden no debe tirar abajo la sala entera;
            // la negociación se reintenta en el siguiente latido.
          }
        }

        // Quien tiene el identificador más chico es el que ofrece. Es una regla
        // arbitraria, pero les da el mismo resultado a los dos lados sin que
        // tengan que ponerse de acuerdo.
        for (const otro of d.participantes) {
          if (otro.userId === yo.id) continue;
          if (conexiones.current.has(otro.userId)) continue;
          if (yo.id < otro.userId) {
            const pc = conexionCon(otro.userId);
            const oferta = await pc.createOffer();
            await pc.setLocalDescription(oferta);
            encolar(otro.userId, { tipo: "oferta", sdp: oferta });
          }
        }

        // Quien se fue: se cierra su conexión y se libera su audio.
        const presentes = new Set(d.participantes.map((p) => p.userId));
        for (const [id, pc] of conexiones.current) {
          if (presentes.has(id)) continue;
          pc.close();
          conexiones.current.delete(id);
          const a = audios.current.get(id);
          if (a) {
            a.srcObject = null;
            a.remove();
            audios.current.delete(id);
          }
        }
      } catch {
        // Un latido perdido no saca a nadie de la sala: se reintenta.
      }
    };

    latir();
    const id = setInterval(latir, LATIDO_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [dentro, channelId, mudo, yo.id, conexionCon, encolar]);

  // Si se cierra la pestaña, se avisa. Sin esto la persona queda como fantasma
  // en la sala hasta que se le vence el latido.
  useEffect(() => {
    if (!dentro) return;
    const alCerrar = () => {
      navigator.sendBeacon?.(
        "/api/chat/voz",
        new Blob([JSON.stringify({ channelId, accion: "salir" })], { type: "application/json" })
      );
    };
    window.addEventListener("pagehide", alCerrar);
    return () => window.removeEventListener("pagehide", alCerrar);
  }, [dentro, channelId]);

  useEffect(() => () => desconectar(), [desconectar]);

  // Quien está en la sala, con quien mira primero: verse a uno mismo arriba
  // confirma que el micrófono quedó abierto.
  const enSala = [...participantes].sort((a, b) =>
    a.userId === yo.id ? -1 : b.userId === yo.id ? 1 : a.name.localeCompare(b.name, "es")
  );

  return (
    <div className="border-b border-border bg-surface-2/50">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <span aria-hidden>🎙</span>
          Sala de voz
          {enSala.length > 0 && (
            <span className="rounded-full bg-good px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {enSala.length}
            </span>
          )}
        </span>

        {!dentro ? (
          <button
            onClick={entrar}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
          >
            Entrar a #{channelName}
          </button>
        ) : (
          <>
            <button
              onClick={() => setMudo((v) => !v)}
              title={mudo ? "Activar micrófono" : "Silenciar micrófono"}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
                mudo
                  ? "bg-critical text-white hover:opacity-90"
                  : "border border-border bg-surface text-foreground hover:border-border-strong"
              }`}
            >
              <IconoMicrofono apagado={mudo} />
              {mudo ? "Micrófono apagado" : "Micrófono abierto"}
            </button>

            {/* Salir siempre en rojo: es la acción de la que uno se quiere
                poder acordar sin buscarla. */}
            <button
              onClick={salir}
              className="flex items-center gap-1.5 rounded bg-critical px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 9c-1.6 0-3.15.25-4.6.7v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .27-.11.52-.29.7l-2.48 2.46c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
              Salir
            </button>
          </>
        )}
      </div>

      {/* Las fichas de quienes están adentro. Con foto, nombre y el estado del
          micrófono: sin eso, una sala con cuatro personas es una lista de
          iniciales que no dice quién habla. */}
      {enSala.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {enSala.map((p) => {
            const habla = hablando.has(p.userId) && !p.muted;
            return (
              <div
                key={p.userId}
                className={`flex min-w-[7.5rem] items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
                  habla
                    ? "border-good bg-good-bg"
                    : "border-border bg-surface"
                }`}
              >
                <span className="relative shrink-0">
                  {/* El anillo verde es la señal de que esa persona está
                      hablando ahora: es lo que Discord resolvió bien y por eso
                      se copia. */}
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-full text-xs font-semibold ${
                      habla
                        ? "bg-good text-white ring-2 ring-good ring-offset-2 ring-offset-[var(--good-bg)]"
                        : "bg-surface-2 text-muted"
                    }`}
                  >
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      iniciales(p.name)
                    )}
                  </span>

                  {p.muted && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-critical text-white ring-2 ring-[var(--surface)]">
                      <IconoMicrofono apagado tamano={9} />
                    </span>
                  )}
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">
                    {p.userId === yo.id ? `${p.name.split(" ")[0]} (tú)` : p.name}
                  </span>
                  <span className="block text-[10px] text-muted">
                    {p.muted ? "Silenciado" : habla ? "Hablando" : "En la sala"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="px-4 pb-2 text-xs text-critical">{error}</p>}
    </div>
  );
}

/** El micrófono, abierto o tachado. */
function IconoMicrofono({ apagado, tamano = 13 }: { apagado?: boolean; tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
      {apagado && (
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}
