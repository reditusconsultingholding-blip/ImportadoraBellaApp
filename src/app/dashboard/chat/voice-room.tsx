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

  return (
    <div className="border-b border-border bg-surface-2/40 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">🎙 Sala de voz</span>

        {!dentro ? (
          <button
            onClick={entrar}
            className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-accent-strong"
          >
            Entrar a #{channelName}
          </button>
        ) : (
          <>
            <button
              onClick={() => setMudo((v) => !v)}
              className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
                mudo
                  ? "border-critical/40 bg-critical-bg text-critical"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {mudo ? "Micrófono apagado" : "Micrófono abierto"}
            </button>
            <button
              onClick={salir}
              className="rounded border border-border px-2.5 py-1 text-xs text-muted transition hover:border-critical hover:text-critical"
            >
              Salir
            </button>
          </>
        )}

        {participantes.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5">
            {participantes.map((p) => (
              <span
                key={p.userId}
                title={p.name}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition ${
                  hablando.has(p.userId)
                    ? "border-good bg-good-bg text-good"
                    : "border-border text-muted"
                }`}
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-surface-2 text-[8px] font-semibold">
                  {iniciales(p.name)}
                </span>
                {p.userId === yo.id ? "Tú" : p.name.split(" ")[0]}
                {p.muted && <span aria-label="silenciado">🔇</span>}
              </span>
            ))}
          </span>
        )}
      </div>

      {error && <p className="mt-1.5 text-xs text-critical">{error}</p>}
    </div>
  );
}
