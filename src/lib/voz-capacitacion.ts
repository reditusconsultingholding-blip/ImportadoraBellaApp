// La voz del recorrido guiado.
//
// Usa la síntesis de voz que ya trae el navegador. No hay servicio contratado,
// ni archivos de audio que subir, ni costo por reproducción: la explicación se
// lee del mismo texto que está en pantalla, así que cuando se corrige un paso
// la voz dice lo corregido en el acto. Grabar los audios habría significado
// que el día que cambie una pantalla haya dos versiones, la escrita y la
// hablada, y la hablada siempre sería la vieja.
//
// Vive separado del componente porque acá está todo lo raro del navegador —las
// voces que llegan tarde, el corte a los quince segundos, el permiso de
// reproducción— y el componente solo tiene que pedir "decí esto".

import { huellaDeTexto } from "@/lib/huella-texto";

/* ---------------------------------------------------------------------
 * LA GRABACIÓN
 *
 * La capacitación tiene voz grabada —"El Faraón", de ElevenLabs— y la voz
 * sintética del navegador como respaldo. La grabada suena a persona; la del
 * navegador suena a navegador, pero está siempre.
 *
 * El problema real de tener audio pregrabado es que la pantalla y la voz pasan
 * a ser dos copias de lo mismo: en cuanto alguien corrige un paso y no vuelve
 * a grabar, la capacitación EXPLICA UNA PANTALLA QUE YA CAMBIÓ, sin fallar, sin
 * avisar, y sin que quien la escucha tenga cómo saberlo.
 *
 * Por eso cada grabación queda atada a una huella del texto con el que se
 * hizo. Si no coincide, ese paso —solo ese— cae a la voz del navegador. Peor
 * voz, pero diciendo lo que la pantalla dice.
 * ------------------------------------------------------------------- */

type EntradaManifiesto = { archivo: string; huella: string; voz: string; modelo: string };
type Manifiesto = Record<string, EntradaManifiesto>;

const CARPETA = "/audio/capacitacion";

let manifiesto: Manifiesto | null = null;
let pedido: Promise<Manifiesto> | null = null;

/**
 * El índice de las grabaciones, pedido una sola vez.
 *
 * Si no está —nunca se grabó, o el despliegue no lo incluye— devuelve un
 * índice vacío y todo cae a la voz del navegador. Que falten los audios no
 * puede dejar la capacitación muda.
 */
export function cargarManifiesto(): Promise<Manifiesto> {
  if (manifiesto) return Promise.resolve(manifiesto);
  if (pedido) return pedido;
  pedido = fetch(`${CARPETA}/manifiesto.json`, { cache: "force-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<Manifiesto>) : {}))
    .catch(() => ({}))
    .then((m) => {
      manifiesto = m;
      return m;
    });
  return pedido;
}

/**
 * La grabación de un paso, si existe y si corresponde al texto de hoy.
 *
 * Devuelve null cuando no hay audio o cuando el texto cambió después de
 * grabarlo. Ese null es el que manda el paso a la voz sintética.
 */
export function grabacionDelPaso(
  id: string,
  texto: string,
  indice: Manifiesto | null,
): string | null {
  const e = indice?.[id];
  if (!e) return null;
  if (e.huella !== huellaDeTexto(texto)) return null;
  return `${CARPETA}/${e.archivo}`;
}

/** Si el navegador puede hablar. En el servidor, no. */
export function hayVoz() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * La mejor voz en español disponible.
 *
 * Se prefiere América Latina sobre España: el equipo es de Ecuador, y una voz
 * peninsular leyendo "vosotros" no suena a la empresa. Si no hay ninguna en
 * español se devuelve null y el que llama decide — hablar en la voz por
 * defecto, que puede ser en inglés leyendo castellano, es peor que no hablar.
 */
export function vozEnEspanol(): SpeechSynthesisVoice | null {
  if (!hayVoz()) return null;
  const voces = window.speechSynthesis.getVoices();
  if (voces.length === 0) return null;

  const enEspanol = voces.filter((v) => v.lang.toLowerCase().startsWith("es"));
  if (enEspanol.length === 0) return null;

  // Por orden de preferencia: la región más cercana primero.
  const prioridad = ["es-ec", "es-co", "es-mx", "es-us", "es-419", "es-ar", "es-cl", "es-pe"];
  for (const clave of prioridad) {
    const v = enEspanol.find((x) => x.lang.toLowerCase().replace("_", "-") === clave);
    if (v) return v;
  }
  return enEspanol[0];
}

/**
 * Las voces no están listas al cargar la página.
 *
 * En Chrome `getVoices()` devuelve una lista vacía la primera vez y se llena
 * más tarde, avisando por `voiceschanged`. Sin esperar eso, el primer paso del
 * recorrido salía mudo o en inglés —justo el paso que la persona escucha para
 * decidir si le sirve— y a partir del segundo andaba bien.
 */
export function alTenerVoces(avisar: () => void) {
  if (!hayVoz()) return () => {};
  if (window.speechSynthesis.getVoices().length > 0) {
    avisar();
    return () => {};
  }
  const mano = () => avisar();
  window.speechSynthesis.addEventListener("voiceschanged", mano);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", mano);
}

/**
 * Parte el texto en pedazos que el navegador pueda decir de una.
 *
 * Chrome corta cualquier frase que pase de unos quince segundos: la deja por
 * la mitad y sigue con la siguiente. Como los pasos del recorrido tienen tres
 * o cuatro oraciones más los puntos, casi todos se cortaban. Se parte por
 * oración y se encolan de a una, que además deja una respiración natural
 * entre ideas.
 */
function enPedazos(texto: string, maximo = 170): string[] {
  const oraciones = texto
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?:;])\s+/)
    .filter(Boolean);

  const pedazos: string[] = [];
  let actual = "";
  for (const oracion of oraciones) {
    // Una oración sola más larga que el tope se parte por coma; si ni así
    // entra, se deja larga: cortarla por número de letras la volvería
    // ininteligible, y es preferible arriesgar el corte de Chrome.
    if (oracion.length > maximo) {
      if (actual) {
        pedazos.push(actual);
        actual = "";
      }
      let trozo = "";
      for (const parte of oracion.split(/(?<=,)\s+/)) {
        if ((trozo + " " + parte).trim().length > maximo && trozo) {
          pedazos.push(trozo.trim());
          trozo = parte;
        } else {
          trozo = (trozo + " " + parte).trim();
        }
      }
      if (trozo) pedazos.push(trozo.trim());
      continue;
    }

    if ((actual + " " + oracion).trim().length > maximo && actual) {
      pedazos.push(actual.trim());
      actual = oracion;
    } else {
      actual = (actual + " " + oracion).trim();
    }
  }
  if (actual) pedazos.push(actual.trim());
  return pedazos;
}

/** Corta lo que se esté diciendo. */
export function callar() {
  if (!hayVoz()) return;
  window.speechSynthesis.cancel();
}

/**
 * Dice un texto completo, en pedazos y en orden.
 *
 * Devuelve una función para cancelar. Siempre hay que llamarla al cambiar de
 * paso: si no, el paso nuevo se encola DETRÁS del anterior y la persona
 * escucha la explicación de una pantalla mientras mira otra.
 */
export function hablar(
  texto: string,
  avisos: { alEmpezar?: () => void; alTerminar?: () => void } = {},
) {
  if (!hayVoz()) return () => {};

  window.speechSynthesis.cancel();

  const voz = vozEnEspanol();
  const pedazos = enPedazos(texto);
  let cancelado = false;

  pedazos.forEach((pedazo, i) => {
    const frase = new SpeechSynthesisUtterance(pedazo);
    if (voz) {
      frase.voice = voz;
      frase.lang = voz.lang;
    } else {
      frase.lang = "es-ES";
    }
    // Un poco más lento que el habla normal del navegador: es material nuevo
    // y la persona está mirando la pantalla al mismo tiempo.
    frase.rate = 0.95;
    frase.pitch = 1;
    // El aviso de "empezó" sale del navegador y no de acá abajo: entre pedir
    // que hable y que suene puede no pasar nada —permiso de reproducción, voz
    // que todavía carga— y dar por empezado lo que nunca arrancó deja al
    // recorrido diciendo "hablando" en silencio.
    if (i === 0 && avisos.alEmpezar) {
      frase.onstart = () => {
        if (!cancelado) avisos.alEmpezar?.();
      };
    }
    if (i === pedazos.length - 1 && avisos.alTerminar) {
      frase.onend = () => {
        if (!cancelado) avisos.alTerminar?.();
      };
    }
    window.speechSynthesis.speak(frase);
  });

  return () => {
    cancelado = true;
    window.speechSynthesis.cancel();
  };
}

/**
 * Lo que se dice de un paso, armado del mismo contenido que se ve.
 *
 * Los puntos se leen como una enumeración hablada y no como una lista: "uno,
 * dos, tres" en voz alta no ayuda a nadie que esté mirando la pantalla, y sin
 * ninguna marca las ideas se pegan entre sí.
 */
export function textoDelPaso(paso: { titulo: string; texto: string; puntos: string[] }) {
  const partes = [paso.titulo, paso.texto];
  if (paso.puntos.length === 1) {
    partes.push("Una cosa para tener en cuenta.", paso.puntos[0]);
  } else if (paso.puntos.length > 1) {
    partes.push(`${paso.puntos.length} cosas para tener en cuenta.`, ...paso.puntos);
  }
  return partes.join(" ");
}
