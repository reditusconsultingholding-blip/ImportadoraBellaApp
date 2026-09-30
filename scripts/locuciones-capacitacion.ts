/**
 * Graba la capacitación con la voz de ElevenLabs.
 *
 *   npx tsx scripts/locuciones-capacitacion.ts --listar
 *   npx tsx scripts/locuciones-capacitacion.ts --voz=<id>
 *   npx tsx scripts/locuciones-capacitacion.ts --voz=<id> --si
 *
 * POR QUÉ UN SCRIPT Y NO LLAMAR A ELEVENLABS DESDE LA APP
 *
 * La capacitación se escucha una vez por persona y el texto cambia cada varias
 * semanas. Pedir el audio en vivo en cada reproducción sería pagar mil veces
 * por lo mismo, y meter una clave de un servicio pago en el servidor de
 * producción para algo que se puede resolver con archivos estáticos.
 *
 * NUNCA REGRABA LO QUE NO CAMBIÓ
 *
 * Cada MP3 queda atado a una huella del texto con el que se grabó. Al correr
 * de nuevo, solo se rehacen los pasos cuyo texto cambió. Corregir una coma en
 * un paso cuesta un paso, no diecinueve minutos de audio.
 *
 * Y NO GASTA SIN QUE SE LO PIDAN
 *
 * Sin `--si` solo dice qué haría y cuánto sale. Gastar créditos de una cuenta
 * paga no puede ser el efecto de equivocarse de comando.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { PASOS } from "@/lib/capacitacion-pasos";
import { textoDelPaso } from "@/lib/voz-capacitacion";
import { huellaDeTexto } from "@/lib/huella-texto";

const SALIDA = join(process.cwd(), "public", "audio", "capacitacion");
const MANIFIESTO = join(SALIDA, "manifiesto.json");

/** De dónde sale la clave, en orden. */
const FUENTES_DE_CLAVE = [
  // La del propio proyecto, si algún día se le pone una.
  join(process.cwd(), ".env"),
  // La que ya existe, del proyecto de Skania. El dueño autorizó usarla.
  "C:/Users/Usuario/Projects/skania/.env.local",
];

/**
 * Achica el MP3 sin volver a pagarle a nadie.
 *
 * ElevenLabs devuelve 128 kbps en estéreo a 44,1 kHz, que es calidad de
 * música. Esto es una persona hablando: en mono, a 22 kHz y 32 kbps se
 * escucha igual de claro y pesa cuatro veces menos. Los diecinueve minutos de
 * capacitación pasan de unos 20 MB a unos 5.
 *
 * No es una manía de tamaño. El equipo entra desde el celular, con datos, y
 * son 24 archivos que se descargan mientras alguien espera para aprender a
 * usar la herramienta. Además cada MB entra al repositorio y se recompila en
 * cada despliegue.
 *
 * Se hace acá y no pidiendo otro formato a la API porque el precio se cobra
 * por caracter, no por calidad: reconvertir localmente es gratis, volver a
 * pedirlo no.
 *
 * Si no hay ffmpeg no pasa nada: queda el archivo grande. Perder una grabación
 * ya pagada por no poder comprimirla sería absurdo.
 */
function comprimir(archivo: string): { antes: number; despues: number } | null {
  const antes = statSync(archivo).size;
  const temporal = archivo.replace(/\.mp3$/, ".tmp.mp3");
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", archivo, "-ac", "1", "-ar", "22050", "-b:a", "32k", temporal],
      { stdio: "pipe" },
    );
  } catch {
    if (existsSync(temporal)) unlinkSync(temporal);
    return null;
  }
  const despues = statSync(temporal).size;
  // Solo se reemplaza si de verdad achicó: un "arreglo" que agranda el archivo
  // no es un arreglo.
  if (despues > 0 && despues < antes) {
    renameSync(temporal, archivo);
    return { antes, despues };
  }
  unlinkSync(temporal);
  return null;
}

type Manifiesto = Record<
  string,
  { archivo: string; huella: string; voz: string; modelo: string; generado: string }
>;

/**
 * Lee la clave sin mostrarla.
 *
 * No se imprime, no se registra y no vuelve en ningún mensaje de error: si
 * falta, se dice que falta y dónde ponerla, no lo que se encontró.
 */
function claveDeElevenLabs(): string {
  if (process.env.ELEVENLABS_API_KEY?.trim()) return process.env.ELEVENLABS_API_KEY.trim();

  for (const ruta of FUENTES_DE_CLAVE) {
    if (!existsSync(ruta)) continue;
    const linea = readFileSync(ruta, "utf8")
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith("ELEVENLABS_API_KEY="));
    if (!linea) continue;
    const valor = linea.slice(linea.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    if (valor) return valor;
  }

  throw new Error(
    "Falta ELEVENLABS_API_KEY. Ponela en el entorno, o en el .env de este proyecto, " +
      "o dejá la de Projects/skania/.env.local donde está.",
  );
}

function argumento(nombre: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(a.indexOf("=") + 1) : null;
}

function leerManifiesto(): Manifiesto {
  if (!existsSync(MANIFIESTO)) return {};
  try {
    return JSON.parse(readFileSync(MANIFIESTO, "utf8")) as Manifiesto;
  } catch {
    // Un manifiesto roto no puede impedir grabar: se regraba todo.
    return {};
  }
}

async function listarVoces() {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": claveDeElevenLabs() },
  });
  if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status} al listar las voces.`);
  const datos = (await res.json()) as {
    voices: { voice_id: string; name: string; labels?: Record<string, string> }[];
  };

  console.log(`\n${datos.voices.length} voces en la cuenta:\n`);
  for (const v of datos.voices) {
    const etiquetas = Object.values(v.labels ?? {}).filter(Boolean).join(", ");
    console.log(`  ${v.voice_id}  ${v.name}${etiquetas ? `  (${etiquetas})` : ""}`);
  }
  console.log(
    "\nDespués:  npx tsx scripts/locuciones-capacitacion.ts --voz=<id>   (agregá --si para grabar)\n",
  );
}

async function grabar() {
  const voz = argumento("voz");
  if (!voz) throw new Error("Falta --voz=<id>. Corré con --listar para verlas.");
  const modelo = argumento("modelo") ?? "eleven_multilingual_v2";
  const confirmado = process.argv.includes("--si");

  const manifiesto = leerManifiesto();
  mkdirSync(SALIDA, { recursive: true });

  const trabajo = PASOS.map((paso) => {
    const texto = textoDelPaso(paso);
    const huella = huellaDeTexto(texto);
    const previo = manifiesto[paso.id];
    const archivo = join(SALIDA, `${paso.id}.mp3`);
    const alDia =
      previo?.huella === huella && previo.voz === voz && previo.modelo === modelo && existsSync(archivo);
    return { paso, texto, huella, archivo, alDia };
  });

  const pendientes = trabajo.filter((t) => !t.alDia);
  const caracteres = pendientes.reduce((s, t) => s + t.texto.length, 0);

  console.log(`\n${trabajo.length} pasos · ${pendientes.length} para grabar · ${trabajo.length - pendientes.length} ya al día`);
  console.log(`${caracteres.toLocaleString("es")} caracteres · voz ${voz} · modelo ${modelo}`);

  if (pendientes.length === 0) {
    console.log("\nNo hay nada que grabar: todo coincide con el texto actual.\n");
    return;
  }

  if (!confirmado) {
    console.log("\nEsto GASTA créditos de ElevenLabs. Volvé a correrlo con --si para hacerlo:\n");
    for (const t of pendientes) console.log(`  ${t.paso.id.padEnd(22)} ${t.texto.length} caracteres`);
    console.log();
    return;
  }

  const clave = claveDeElevenLabs();
  for (const t of pendientes) {
    process.stdout.write(`  ${t.paso.id.padEnd(22)} `);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}`, {
      method: "POST",
      headers: {
        "xi-api-key": clave,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: t.texto,
        model_id: modelo,
        // Estable y parejo: es material informativo que se escucha una vez,
        // no una lectura dramatizada. Una voz que cambia de intensidad entre
        // pasos suena a que algo falló.
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      }),
    });

    if (!res.ok) {
      console.log(`FALLÓ (${res.status})`);
      throw new Error(
        `ElevenLabs respondió ${res.status} en el paso "${t.paso.id}". Los pasos ya grabados quedan guardados.`,
      );
    }

    writeFileSync(t.archivo, Buffer.from(await res.arrayBuffer()));
    const achicado = comprimir(t.archivo);
    manifiesto[t.paso.id] = {
      archivo: `${t.paso.id}.mp3`,
      huella: t.huella,
      voz,
      modelo,
      generado: new Date().toISOString(),
    };
    // Se guarda DESPUÉS DE CADA PASO, no al final: si se corta a la mitad, lo
    // ya pagado queda registrado y la próxima corrida no lo vuelve a comprar.
    writeFileSync(MANIFIESTO, JSON.stringify(manifiesto, null, 2) + "\n");
    console.log(
      achicado
        ? `listo (${Math.round(achicado.antes / 1024)} KB → ${Math.round(achicado.despues / 1024)} KB)`
        : "listo",
    );
  }

  console.log(`\n${pendientes.length} pasos grabados en public/audio/capacitacion/\n`);
}

const tarea = process.argv.includes("--listar") ? listarVoces() : grabar();
tarea.catch((e: unknown) => {
  console.error("\n" + (e instanceof Error ? e.message : String(e)) + "\n");
  process.exit(1);
});
