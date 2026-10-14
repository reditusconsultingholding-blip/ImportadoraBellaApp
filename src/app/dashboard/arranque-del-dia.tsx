"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { claveDelDia, fraseDelDia } from "@/lib/frases-del-dia";
import { saludoDeAhora } from "./saludo";

/**
 * El arranque del día: una frase, «¿Estás listo?» y la cuenta de 5 a 1.
 *
 * Pedido de Sebastián: «cada inicio de día que les dé una frase motivacional en
 * un pop-up, y cuando presionen les diga ¿Estás listo? y comience un conteo
 * regresivo de 5 a 1 con números tipo Tron. Los detalles alegran el alma con
 * buenas interfaces».
 *
 * UNA VEZ POR DÍA Y POR NAVEGADOR. La marca es la fecha de Ecuador, no un
 * contador de horas: quien entra a las 7 y vuelve a las 11 no lo ve dos veces,
 * y quien entra por primera vez un martes lo ve ese martes. Vive en el
 * navegador y no en la base porque no es un dato del negocio —nadie va a
 * preguntar quién vio la frase del jueves— y guardarlo en el servidor sería
 * una escritura por persona por día para una animación.
 *
 * SE PUEDE VOLVER A VER. Sebastián: «déjame ver cuando reinicie». Con
 * `?arranque=1` en la dirección se abre aunque ya se haya visto hoy, sin
 * borrar nada. Es la única forma de revisarlo sin esperar a mañana.
 *
 * NO BLOQUEA. Se cierra con Escape, con «Saltar» y al terminar la cuenta. Una
 * pantalla de bienvenida que no deja pasar deja de ser un detalle y se vuelve
 * un peaje: el equipo abre esto a las siete de la mañana para mirar números.
 */

const CLAVE = "arranque-visto";
/** Cuánto dura cada número en pantalla. Igual que su animación. */
const PASO_MS = 760;

/* Si estamos en el navegador, sin efectos ni `setState`.
   //
   // El primer render del cliente usa el valor del servidor —false— así que el
   // HTML coincide y no hay aviso de hidratación; recién después React pide el
   // valor real y el pop-up entra. */
const SIN_CAMBIOS = () => () => {};
const enElNavegador = () => true;
const enElServidor = () => false;

/** Si a esta persona le toca verlo ahora. Se decide una sola vez. */
function correspondeMostrar() {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("arranque") === "1") return true;
  try {
    return window.localStorage.getItem(CLAVE) !== claveDelDia();
  } catch {
    // Sin almacenamiento se muestra: una vez de más es mejor que nunca.
    return true;
  }
}

export default function ArranqueDelDia({ nombre }: { nombre: string }) {
  const montado = useSyncExternalStore(SIN_CAMBIOS, enElNavegador, enElServidor);
  const [tocaHoy] = useState(correspondeMostrar);
  const [frase] = useState(() => fraseDelDia());
  const [cerrado, setCerrado] = useState(false);
  const [contando, setContando] = useState(false);
  const [numero, setNumero] = useState(5);

  const abierto = montado && tocaHoy && !cerrado;

  function cerrar() {
    setCerrado(true);
    try {
      window.localStorage.setItem(CLAVE, claveDelDia());
    } catch {
      // Que no se pueda recordar no impide cerrarlo.
    }
  }

  // La cuenta: un número cada 760 ms. Encadenado con `setTimeout` y no con
  // `setInterval` porque al cerrarse en medio —alguien aprieta Escape en el 3—
  // un intervalo sigue vivo un ciclo más. El cambio ocurre dentro del
  // temporizador, nunca en el cuerpo del efecto.
  useEffect(() => {
    if (!abierto || !contando) return;
    const id = setTimeout(() => {
      if (numero <= 1) cerrar();
      else setNumero((n) => n - 1);
    }, PASO_MS);
    return () => clearTimeout(id);
  }, [abierto, contando, numero]);

  // AVISARLE AL RESTO DE LA APP QUE HAY ALGO ENCIMA.
  //
  // Este pop-up tapa la pantalla entera. La firma del menú se descifra en poco
  // más de un segundo y una sola vez al día: si lo hace debajo de este velo,
  // nadie la ve y encima queda marcada como vista hasta mañana. Mientras está
  // abierto, el documento lleva la marca; al cerrarse, avisa.
  useEffect(() => {
    if (!abierto) return;
    const raiz = document.documentElement;
    raiz.dataset.arranque = "1";
    return () => {
      delete raiz.dataset.arranque;
      window.dispatchEvent(new Event("arranque-cerrado"));
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [abierto]);

  if (!abierto) return null;

  const soloNombre = nombre.trim().split(/\s+/)[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Arranque del día"
      className="arranque-velo fixed inset-0 z-[90] grid place-items-center bg-brand-navy-deep/92 px-6 backdrop-blur-sm"
    >
      {/* La rejilla de fondo: el piso de Tron. Va muy tenue y se desvanece
          hacia los bordes, porque a pantalla completa una rejilla marcada
          compite con el texto, que es lo que hay que leer. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(0 164 124 / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(0 164 124 / 0.5) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(70% 60% at 50% 50%, #000 10%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(70% 60% at 50% 50%, #000 10%, transparent 75%)",
        }}
      />

      {!contando ? (
        <div className="arranque-entra relative w-full max-w-xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-green">
            {saludoDeAhora()}, {soloNombre}
          </p>
          <p className="mt-5 text-[26px] font-semibold leading-snug text-white md:text-[32px]">
            {frase.texto}
          </p>
          {/* La obra va al lado del nombre, en gris: no es adorno, es lo que
              permite comprobar la cita. Muchas frases que circulan firmadas
              por Séneca o Aristóteles no son suyas; decir de dónde sale es la
              diferencia entre citar y repetir. */}
          <p className="mt-4 text-[13px] text-white/50">
            — {frase.autor}
            <span className="text-white/30"> · {frase.obra}</span>
          </p>
          <div className="mt-9 flex items-center justify-center gap-4">
            <button
              type="button"
              autoFocus
              onClick={() => setContando(true)}
              className="arranque-boton rounded-full bg-brand-green px-7 py-2.5 text-sm font-semibold text-brand-navy-deep transition hover:bg-white"
            >
              ¿Estás listo?
            </button>
            <button
              type="button"
              onClick={cerrar}
              className="text-xs text-white/45 transition hover:text-white/80"
            >
              Saltar
            </button>
          </div>
        </div>
      ) : (
        <div className="relative grid place-items-center" onClick={cerrar}>
          {/* La clave de que se lea como Tron y no como un reloj: el número no
              aparece, LLEGA. Entra grande y desenfocado, se asienta en el
              centro y se va encogiendo mientras se apaga, con el halo detrás
              expandiéndose. Es la misma gramática del aro de la pantalla de
              carga, subida de intensidad.

              La `key` con el número es lo que hace que la animación vuelva a
              empezar en cada cifra: sin ella React reusa el nodo, la animación
              no se reinicia y lo único que cambia es el dígito. */}
          <span
            key={`halo${numero}`}
            aria-hidden
            className="arranque-halo absolute h-56 w-56 rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, rgb(0 164 124 / 0.55) 0%, rgb(0 164 124 / 0.12) 45%, transparent 72%)",
            }}
          />
          <span
            key={numero}
            className="arranque-numero relative font-semibold tabular-nums text-white"
            style={{ fontSize: "clamp(7rem, 26vw, 15rem)", lineHeight: 1 }}
          >
            {numero}
          </span>
          <span className="sr-only" aria-live="assertive">
            {numero}
          </span>
          <p className="absolute -bottom-2 text-[11px] uppercase tracking-[0.3em] text-brand-green">
            A trabajar
          </p>
        </div>
      )}
    </div>
  );
}
