"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Sala de voz de un canal, al estilo Discord: se entra y se escucha a todos.
//
// El audio y el video van DIRECTO de un navegador a otro (WebRTC en malla). Por
// el servidor solo pasa el saludo inicial — quién está adentro y los mensajes
// de negociación. No hay servidor de medios ni WebSocket: se consulta cada dos
// segundos, que para un equipo de diez personas alcanza de sobra y evita montar
// infraestructura nueva.
//
// Límite conocido: solo hay servidores STUN, no TURN. En la mayoría de las
// redes alcanza, pero detrás de un NAT simétrico —algunas redes corporativas y
// ciertos datos móviles— la conexión directa no se puede armar y esa persona
// no va a escuchar ni ver a nadie. Cuando pasa, la pantalla lo dice en vez de
// quedarse muda sin explicación. Con la cámara el problema es el mismo, no uno
// nuevo: viaja por la misma conexión que el audio.

const STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const LATIDO_MS = 2000;

/**
 * Con qué se pide la cámara.
 *
 * 640×360 y 20 cuadros, no lo que el equipo pueda dar. En una malla cada cámara
 * se codifica y se sube UNA VEZ POR CADA otra persona de la sala: pedir 1080p no
 * mejora nada —el video se ve en una ficha de dos dedos— y multiplica por seis
 * lo que hay que subir. Va con `ideal` y no `exact` para que una cámara que no
 * tenga ese modo entregue el más parecido en vez de fallar y no abrir nada.
 */
const CAMARA = {
  width: { ideal: 640 },
  height: { ideal: 360 },
  frameRate: { ideal: 20, max: 24 },
};

/**
 * Cuántas cámaras se aguantan a la vez.
 *
 * El tope de verdad lo aplica el servidor y viaja en la respuesta del latido
 * (`maxCamaras`); acá se repite solo para no ofrecer un botón que va a rebotar
 * antes del primer latido. El porqué del número está en
 * `src/app/api/chat/voz/route.ts`.
 */
const MAX_CAMARAS = 4;

type Participante = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  muted: boolean;
  camara: boolean;
  manoLevantadaAt: string | null;
  silenciadoPor: { id: string; name: string } | null;
  silenciadoEnAt: string | null;
  joinedAt: string;
};

type Senal = { to: string; payload: unknown };

type RespuestaLatido = {
  participantes: Participante[];
  recibidas: { from: string; payload: Record<string, unknown> }[];
  maxCamaras?: number;
  camaraRechazada?: boolean;
  puedeSilenciar?: boolean;
};

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
  const [mano, setMano] = useState(false);
  const [camaraEncendida, setCamaraEncendida] = useState(false);
  const [miVideo, setMiVideo] = useState<MediaStream | null>(null);
  const [videosRemotos, setVideosRemotos] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [puedeSilenciar, setPuedeSilenciar] = useState(false);
  const [maxCamaras, setMaxCamaras] = useState(MAX_CAMARAS);
  const [hablando, setHablando] = useState<Set<string>>(new Set());

  const micRef = useRef<MediaStream | null>(null);
  const camRef = useRef<MediaStream | null>(null);
  const conexiones = useRef(new Map<string, RTCPeerConnection>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  // Lo que llega de cada persona, armado a mano juntando sus pistas. No se usa
  // el stream que trae `ontrack` porque el hueco de video se reserva sin cámara
  // (ver `conexionCon`) y en ese caso llega sin stream asociado.
  const remotos = useRef(new Map<string, MediaStream>());
  // El sitio por el que sale la cámara hacia cada persona. Se reserva al armar
  // la conexión y se llena y se vacía después, sin volver a negociar.
  const enviosDeVideo = useRef(new Map<string, RTCRtpSender>());
  const salientes = useRef<Senal[]>([]);
  const dentroRef = useRef(false);
  // El latido lee estos tres en cada vuelta. Van por referencia y no por estado
  // para que tocar el micrófono no reinicie el intervalo del latido.
  const mudoRef = useRef(false);
  const manoRef = useRef(false);
  const camaraRef = useRef(false);

  const encolar = useCallback((to: string, payload: unknown) => {
    salientes.current.push({ to, payload });
  }, []);

  /** A quién de los dos le toca ofrecer. Ver `conexionCon`. */
  const soyElQueOfrece = useCallback((otroId: string) => yo.id < otroId, [yo.id]);

  /** Cierra todo y suelta el micrófono y la cámara. */
  const desconectar = useCallback(() => {
    dentroRef.current = false;
    for (const pc of conexiones.current.values()) pc.close();
    conexiones.current.clear();
    for (const a of audios.current.values()) {
      a.srcObject = null;
      a.remove();
    }
    audios.current.clear();
    enviosDeVideo.current.clear();
    remotos.current.clear();
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    camRef.current?.getTracks().forEach((t) => t.stop());
    camRef.current = null;
    salientes.current = [];
    mudoRef.current = false;
    manoRef.current = false;
    camaraRef.current = false;
    setParticipantes([]);
    setHablando(new Set());
    setVideosRemotos({});
    setMiVideo(null);
    setCamaraEncendida(false);
    setMano(false);
    setMudo(false);
  }, []);

  /** Baja la mano. Se usa desde el botón y desde el medidor de volumen. */
  const bajarMano = useCallback(() => {
    if (!manoRef.current) return;
    manoRef.current = false;
    setMano(false);
  }, []);

  /** Detecta quién está hablando, para marcarlo en pantalla. */
  const escucharVolumen = useCallback(
    (id: string, stream: MediaStream) => {
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
          const activo = nivel > 12;

          // La mano se baja sola al empezar a hablar: en ese momento ya no pide
          // turno, lo está usando. Dejarla levantada la convertiría en una
          // casilla que hay que acordarse de apagar, y a los diez minutos la
          // lista tendría seis manos y ningún turno.
          if (activo && id === yo.id) bajarMano();

          setHablando((prev) => {
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
        // está hablando, y la mano hay que bajarla a mano.
      }
    },
    [bajarMano, yo.id]
  );

  /** Arma una oferta y la encola. Solo la llama quien tiene el turno de ofrecer. */
  const ofrecerA = useCallback(
    async (otroId: string, pc: RTCPeerConnection) => {
      try {
        const oferta = await pc.createOffer();
        await pc.setLocalDescription(oferta);
        encolar(otroId, { tipo: "oferta", sdp: oferta });
      } catch {
        // Si la conexión estaba a mitad de otra negociación se reintenta en la
        // próxima vuelta, en vez de dejarla rota.
      }
    },
    [encolar]
  );

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

      const mic = micRef.current;
      if (mic) for (const pista of mic.getAudioTracks()) pc.addTrack(pista, mic);

      // El sitio del video se reserva ACÁ, al armar la conexión, aunque todavía
      // no haya cámara. Es la decisión que hace que prender la cámara no tenga
      // que renegociar nada: después basta con `replaceTrack`.
      //
      // La alternativa —agregar la pista recién al prender la cámara— obliga a
      // rehacer la negociación con cada persona de la sala, y eso acá viaja por
      // una consulta cada dos segundos. Con dos personas prendiendo la cámara
      // al mismo tiempo, las ofertas se cruzan y lo que se cae no es el video:
      // es la conexión entera, audio incluido. Un carril de video vacío no
      // cuesta nada mientras no pase nada por él.
      //
      // Las dos puntas corren este mismo código en el mismo orden —audio y
      // después video—, así que las pistas se emparejan sin ambigüedad.
      const pistaCam = camRef.current?.getVideoTracks()[0];
      const carril = pc.addTransceiver(pistaCam ?? "video", { direction: "sendrecv" });
      enviosDeVideo.current.set(otroId, carril.sender);

      pc.onicecandidate = (e) => {
        if (e.candidate) encolar(otroId, { tipo: "ice", candidate: e.candidate.toJSON() });
      };

      pc.ontrack = (e) => {
        // Se junta lo que llega en un stream propio en vez de usar el que trae
        // el evento: el carril de video reservado sin cámara llega sin stream
        // asociado, y ese es justamente el que después se llena.
        let stream = remotos.current.get(otroId);
        if (!stream) {
          stream = new MediaStream();
          remotos.current.set(otroId, stream);
        }
        if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);

        // El audio sale por un elemento suelto y no por el <video>: ese elemento
        // lo monta y lo desmonta React según quién tenga la cámara prendida, y
        // el sonido no puede depender de eso. El <video> va en silencio
        // justamente para que no se escuche dos veces.
        let audio = audios.current.get(otroId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audios.current.set(otroId, audio);
        }
        if (audio.srcObject !== stream) {
          audio.srcObject = stream;
          audio.play().catch(() => {
            // Algunos navegadores exigen un gesto del usuario antes de
            // reproducir. Entrar a la sala ya es uno, así que esto casi nunca
            // cae acá.
          });
        }

        const suyo = stream;
        setVideosRemotos((prev) => (prev[otroId] === suyo ? prev : { ...prev, [otroId]: suyo }));
        // El medidor se cuelga una sola vez, con la pista de audio: engancharlo
        // también al video mediría silencio y borraría el aro de "está
        // hablando".
        if (e.track.kind === "audio") escucharVolumen(otroId, stream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          setError(
            "No se pudo abrir la conexión con alguien de la sala. Suele pasar en redes que bloquean las conexiones directas."
          );
        }
      };

      return pc;
    },
    [encolar, escucharVolumen]
  );

  /**
   * Apaga la cámara: se vacía el carril de video de cada conexión y se suelta
   * el aparato. El carril queda ahí, vacío, listo para volver a llenarse — por
   * eso apagar y prender no renegocia nada y es instantáneo.
   */
  const apagarCamara = useCallback(() => {
    for (const envio of enviosDeVideo.current.values()) {
      envio.replaceTrack(null).catch(() => {
        // Si la conexión ya se estaba cerrando, vaciar el carril no aporta nada.
      });
    }
    // Se detiene el aparato, no solo la pista: sin esto la luz de la cámara
    // queda encendida y la persona cree que la sigue estando viendo.
    camRef.current?.getTracks().forEach((t) => t.stop());
    camRef.current = null;
    camaraRef.current = false;
    setCamaraEncendida(false);
    setMiVideo(null);
  }, []);

  async function entrar() {
    setError(null);
    setAviso(null);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micRef.current = mic;
      dentroRef.current = true;
      // Escucharse a uno mismo es lo que permite que la mano se baje sola al
      // empezar a hablar, y de paso confirma que el micrófono quedó abierto.
      escucharVolumen(yo.id, mic);
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
    setAviso(null);
    fetch("/api/chat/voz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, accion: "salir" }),
    }).catch(() => {});
  }

  // Silenciarse corta el audio en origen: la pista sigue abierta pero no manda
  // nada. Cerrarla obligaría a renegociar con cada persona de la sala.
  function aplicarMudo(nuevo: boolean) {
    mudoRef.current = nuevo;
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !nuevo));
    setMudo(nuevo);
  }

  function alternarMano() {
    const nuevo = !manoRef.current;
    manoRef.current = nuevo;
    setMano(nuevo);
  }

  async function alternarCamara() {
    setAviso(null);
    if (camaraRef.current) {
      apagarCamara();
      return;
    }

    // El tope se vuelve a chequear en el servidor; acá es para no encender la
    // cámara, pedirle permiso a la persona y apagarla dos segundos después.
    const otras = participantes.filter((p) => p.camara && p.userId !== yo.id).length;
    if (otras >= maxCamaras) {
      setAviso(
        `Ya hay ${maxCamaras} cámaras prendidas, que es el máximo que aguanta la sala. Espera a que alguien apague la suya.`
      );
      return;
    }

    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: CAMARA });
      const pista = cam.getVideoTracks()[0];
      if (!pista) throw new Error("la cámara no entregó video");
      camRef.current = cam;
      // La pista entra por el carril que ya estaba negociado con cada persona.
      // No hay oferta ni respuesta de por medio: el video aparece del otro lado
      // en cuanto llegan los primeros cuadros.
      for (const envio of enviosDeVideo.current.values()) {
        envio.replaceTrack(pista).catch(() => {
          // Una conexión que se estaba cayendo no tiene que impedir que la
          // cámara se vea en las demás.
        });
      }
      camaraRef.current = true;
      setCamaraEncendida(true);
      setMiVideo(cam);
    } catch {
      setError(
        "No se pudo usar la cámara. Hay que darle permiso al navegador, y no puede estar en uso por otro programa."
      );
    }
  }

  /** La orden de dirección: callar a alguien, o devolverle el micrófono. */
  async function ordenarSilencio(objetivo: Participante, silenciar: boolean) {
    setAviso(null);
    try {
      const res = await fetch("/api/chat/voz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          accion: silenciar ? "silenciar" : "quitar-silencio",
          targetId: objetivo.userId,
        }),
      });
      const data = (await res.json()) as { error?: string; participantes?: Participante[] };
      if (!res.ok) {
        setAviso(data.error ?? "No se pudo hacer eso.");
        return;
      }
      if (data.participantes) setParticipantes(data.participantes);
    } catch {
      setAviso("No se pudo avisar al servidor. Vuelve a intentarlo.");
    }
  }

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
          body: JSON.stringify({
            channelId,
            accion: "latir",
            muted: mudoRef.current,
            mano: manoRef.current,
            camara: camaraRef.current,
            senales: aEnviar,
          }),
        });
        if (!res.ok || !vivo) return;
        const d = (await res.json()) as RespuestaLatido;
        setParticipantes(d.participantes);
        if (typeof d.maxCamaras === "number") setMaxCamaras(d.maxCamaras);
        setPuedeSilenciar(Boolean(d.puedeSilenciar));

        // El servidor rechazó la cámara porque la sala llegó al tope. Se apaga
        // de este lado también: dejarla prendida gastaría batería y datos
        // mandando una pista que nadie está mirando.
        if (d.camaraRechazada && camaraRef.current) {
          apagarCamara();
          setAviso(
            `Ya hay ${d.maxCamaras ?? maxCamaras} cámaras prendidas, que es el máximo que aguanta la sala.`
          );
        }

        // Un silencio puesto por dirección se obedece acá, no solo se dibuja:
        // el servidor ya lo dejó escrito y este lado corta la pista de verdad.
        const mia = d.participantes.find((p) => p.userId === yo.id);
        if (mia?.silenciadoPor && !mudoRef.current) {
          mudoRef.current = true;
          micRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
          setMudo(true);
        }

        // Primero se procesa lo que llegó, después se abren las conexiones
        // nuevas: si se hiciera al revés, una oferta recién recibida podría
        // chocar con otra que se acaba de crear.
        for (const s of d.recibidas) {
          const pc = conexionCon(s.from);
          const p = s.payload as {
            tipo: string;
            sdp?: RTCSessionDescriptionInit;
            candidate?: RTCIceCandidateInit;
          };
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
          const pc = conexionCon(otro.userId);
          if (soyElQueOfrece(otro.userId)) await ofrecerA(otro.userId, pc);
        }

        // Quien se fue: se cierra su conexión y se libera su audio y su video.
        const presentes = new Set(d.participantes.map((p) => p.userId));
        const idos: string[] = [];
        for (const [id, pc] of conexiones.current) {
          if (presentes.has(id)) continue;
          pc.close();
          conexiones.current.delete(id);
          enviosDeVideo.current.delete(id);
          remotos.current.delete(id);
          const a = audios.current.get(id);
          if (a) {
            a.srcObject = null;
            a.remove();
            audios.current.delete(id);
          }
          idos.push(id);
        }
        if (idos.length > 0) {
          setVideosRemotos((prev) => {
            const next = { ...prev };
            for (const id of idos) delete next[id];
            return next;
          });
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
  }, [
    dentro,
    channelId,
    yo.id,
    conexionCon,
    encolar,
    ofrecerA,
    soyElQueOfrece,
    apagarCamara,
    maxCamaras,
  ]);

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

  // La lista llega YA ORDENADA del servidor: primero las manos levantadas por
  // orden de quién la levantó antes, después el resto por orden de llegada.
  // Antes esta pantalla movía a quien mira al principio; eso ahora rompería el
  // turno, que es lo único que la mano tiene para dar.
  const enSala = participantes;
  const manosLevantadas = enSala.filter((p) => p.manoLevantadaAt);
  // La cámara propia se muestra en cuanto se prende, sin esperar a que el
  // servidor la confirme en el próximo latido: dos segundos de nada después de
  // darle permiso a la cámara se leen como que el botón no hizo nada.
  const conCamara = enSala.filter((p) => p.camara || (p.userId === yo.id && camaraEncendida));
  const miFicha = enSala.find((p) => p.userId === yo.id);

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
              onClick={() => aplicarMudo(!mudo)}
              disabled={Boolean(miFicha?.silenciadoPor)}
              title={
                miFicha?.silenciadoPor
                  ? `Te silenció ${miFicha.silenciadoPor.name}`
                  : mudo
                    ? "Activar micrófono"
                    : "Silenciar micrófono"
              }
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                mudo
                  ? "bg-critical text-white hover:opacity-90"
                  : "border border-border bg-surface text-foreground hover:border-border-strong"
              }`}
            >
              <IconoMicrofono apagado={mudo} />
              {mudo ? "Micrófono apagado" : "Micrófono abierto"}
            </button>

            <button
              onClick={alternarCamara}
              title={camaraEncendida ? "Apagar la cámara" : "Encender la cámara"}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
                camaraEncendida
                  ? "bg-accent text-white hover:bg-accent-strong"
                  : "border border-border bg-surface text-foreground hover:border-border-strong"
              }`}
            >
              <IconoCamara apagada={!camaraEncendida} />
              {camaraEncendida ? "Cámara encendida" : "Cámara"}
            </button>

            {/* La mano es para pedir turno cuando ya hay alguien hablando: se ve
                en la lista, en el orden en que la levantaron. */}
            <button
              onClick={alternarMano}
              title={mano ? "Bajar la mano" : "Levantar la mano para pedir turno"}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
                mano
                  ? "bg-warning text-white hover:opacity-90"
                  : "border border-border bg-surface text-foreground hover:border-border-strong"
              }`}
            >
              <span aria-hidden>✋</span>
              {mano ? "Mano levantada" : "Levantar la mano"}
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

      {/* Que te silencien sin decirte quién ni por qué se reporta como que la
          app está rota. Por eso el aviso nombra a la persona. */}
      {miFicha?.silenciadoPor && (
        <p className="mx-4 mb-2 rounded border border-critical/30 bg-critical-bg px-3 py-2 text-xs text-critical">
          <span className="font-medium">{miFicha.silenciadoPor.name} te silenció.</span> Tu
          micrófono queda apagado hasta que te lo devuelva. Puedes seguir escuchando y escribiendo
          en el canal.
        </p>
      )}

      {manosLevantadas.length > 0 && (
        <p className="mx-4 mb-2 text-xs text-muted">
          ✋ Pidieron la palabra, en orden:{" "}
          <span className="font-medium text-foreground">
            {manosLevantadas
              .map((p) => (p.userId === yo.id ? "tú" : p.name.split(" ")[0]))
              .join(" · ")}
          </span>
        </p>
      )}

      {/* El video, cuando hay. Solo aparece si alguien prendió la cámara: una
          fila de rectángulos negros vacíos ocuparía media pantalla del chat sin
          decir nada. */}
      {dentro && conCamara.length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-3 lg:grid-cols-4">
          {conCamara.map((p) => {
            const propio = p.userId === yo.id;
            const stream = propio ? miVideo : videosRemotos[p.userId];
            return (
              <figure
                key={p.userId}
                className={`relative overflow-hidden rounded-lg border bg-brand-navy-deep ${
                  hablando.has(p.userId) && !p.muted ? "border-good" : "border-border"
                }`}
              >
                {stream ? (
                  <Video stream={stream} espejo={propio} />
                ) : (
                  <div className="grid aspect-video place-items-center text-[11px] text-white/50">
                    Conectando…
                  </div>
                )}
                <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/55 px-1.5 py-1 text-[10px] font-medium text-white">
                  {p.muted && <IconoMicrofono apagado tamano={9} />}
                  <span className="truncate">
                    {propio ? `${p.name.split(" ")[0]} (tú)` : p.name}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}

      {/* Las fichas de quienes están adentro. Con foto, nombre y el estado del
          micrófono: sin eso, una sala con cuatro personas es una lista de
          iniciales que no dice quién habla. */}
      {enSala.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {enSala.map((p, i) => {
            const habla = hablando.has(p.userId) && !p.muted;
            const turno = p.manoLevantadaAt ? i + 1 : null;
            return (
              <div
                key={p.userId}
                className={`flex min-w-[7.5rem] items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
                  habla ? "border-good bg-good-bg" : "border-border bg-surface"
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
                      <img src={p.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      iniciales(p.name)
                    )}
                  </span>

                  {p.muted && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-critical text-white ring-2 ring-[var(--surface)]">
                      <IconoMicrofono apagado tamano={9} />
                    </span>
                  )}

                  {/* El número es el turno, no un adorno: dice a quién le toca
                      después de quién. */}
                  {turno !== null && (
                    <span className="absolute -left-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 text-[9px] font-semibold text-white ring-2 ring-[var(--surface)]">
                      {turno}
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {p.userId === yo.id ? `${p.name.split(" ")[0]} (tú)` : p.name}
                  </span>
                  <span className="block text-[10px] text-muted">
                    {p.silenciadoPor
                      ? `Silenciado por ${p.silenciadoPor.name.split(" ")[0]}`
                      : p.manoLevantadaAt
                        ? "Pidió la palabra"
                        : p.muted
                          ? "Silenciado"
                          : habla
                            ? "Hablando"
                            : p.camara
                              ? "En la sala · con cámara"
                              : "En la sala"}
                  </span>
                </span>

                {/* El botón solo lo ven los roles altos, pero el permiso lo
                    decide el servidor: esconderlo evita el clic de más, no el
                    pedido hecho a mano. */}
                {dentro && puedeSilenciar && p.userId !== yo.id && (
                  <button
                    onClick={() => ordenarSilencio(p, !p.silenciadoPor)}
                    title={
                      p.silenciadoPor
                        ? `Devolverle el micrófono a ${p.name}`
                        : `Silenciar a ${p.name}`
                    }
                    className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-medium transition ${
                      p.silenciadoPor
                        ? "border border-border text-muted hover:text-foreground"
                        : "border border-border text-muted hover:border-critical hover:text-critical"
                    }`}
                  >
                    {p.silenciadoPor ? "Devolver" : "Silenciar"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aviso && <p className="px-4 pb-2 text-xs text-warning">{aviso}</p>}
      {error && <p className="px-4 pb-2 text-xs text-critical">{error}</p>}
    </div>
  );
}

/**
 * Un recuadro de video.
 *
 * El stream se cuelga por `srcObject` desde un efecto y no como atributo: no es
 * serializable, así que no hay forma de pasarlo por JSX.
 */
function Video({ stream, espejo }: { stream: MediaStream; espejo: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play().catch(() => {
      // Entrar a la sala ya fue un gesto del usuario; si aun así el navegador
      // no lo deja arrancar, el recuadro queda quieto y el audio sigue.
    });
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      // En silencio a propósito: el sonido de cada persona sale por su elemento
      // de audio. Sin esto se escucharía dos veces, y la voz propia en eco.
      muted
      // La imagen propia va espejada, que es como uno se ve en el espejo y como
      // lo hace cualquier videollamada; las de los demás, no.
      className={`aspect-video w-full bg-black object-cover ${espejo ? "-scale-x-100" : ""}`}
    />
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

/** La cámara, encendida o tachada. */
function IconoCamara({ apagada, tamano = 13 }: { apagada?: boolean; tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm14 4.5 3.3-2.2a.6.6 0 0 1 .95.5v6.4a.6.6 0 0 1-.95.5L18 13.5z" />
      {apagada && (
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
