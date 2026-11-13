/**
 * Graba los videos de capacitación: el panel real, con la voz de cada paso a
 * 1,25x.
 *
 *   JARVIS_TOKEN=<cookie jarvis_session> npx tsx scripts/videos-capacitacion.ts
 *   ... --solo=control-riesgo,control-shopify-ads   (solo esos pasos)
 *   ... --todos                                     (rehace aunque no haya cambiado)
 *   ... --url=http://localhost:3481                 (dónde está el panel)
 *
 * QUÉ HACE, PASO POR PASO
 *
 * 1. Toma los pasos de la capacitación que ve el dueño (los ve todos).
 * 2. Usa la grabación de voz que ya existe para ese paso (El Faraón, la misma
 *    del recorrido). Si el texto del paso cambió y la voz no se regrabó, el
 *    paso se salta y lo dice: primero `scripts/locuciones-capacitacion.ts`.
 * 3. Abre esa pantalla en Chrome con la sesión, marca en el menú la sección,
 *    pone abajo un subtítulo con lo que la voz va diciendo y recorre la
 *    pantalla de arriba abajo al ritmo de la voz. Solo mira: no hace clic en
 *    nada que guarde, así que se puede grabar contra la base real.
 * 4. Une la imagen con la voz acelerada a 1,25x (Sebastian, 12-nov: «que el
 *    audio esté x1.25 para que sea más rápido») y lo guarda liviano en
 *    public/video/capacitacion, con su portada.
 * 5. Anota en manifiesto.json la huella del texto con el que se grabó. La
 *    burbuja de ayuda solo ofrece el video mientras el texto del paso siga
 *    siendo ese: un video de una pantalla vieja no se muestra.
 *
 * NO GASTA NADA: la voz ya está grabada, y Chrome y ffmpeg son locales.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { pasosParaUsuario, type PasoCapacitacion } from "@/lib/capacitacion-pasos";
import { textoDelPaso } from "@/lib/voz-capacitacion";
import { huellaDeTexto } from "@/lib/huella-texto";

const VELOCIDAD = 1.25;
const ANCHO = 1280;
const ALTO = 720;
const AUDIO = join(process.cwd(), "public", "audio", "capacitacion");
const SALIDA = join(process.cwd(), "public", "video", "capacitacion");
const MANIFIESTO = join(SALIDA, "manifiesto.json");

const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

function argumento(nombre: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : null;
}

/** ffmpeg y ffprobe: del PATH, o de FFMPEG_DIR. */
function herramienta(nombre: "ffmpeg" | "ffprobe"): string {
  const dir = process.env.FFMPEG_DIR;
  return dir ? join(dir, `${nombre}.exe`) : nombre;
}

function segundosDe(archivo: string): number {
  const out = execFileSync(herramienta("ffprobe"), [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo,
  ]).toString();
  return Number.parseFloat(out);
}

class Redirigido extends Error {}

type EntradaVideo = { archivo: string; huella: string; segundos: number; poster: string; generado: string };

/**
 * Los tramos del subtítulo: el título con la explicación, y después cada
 * punto. La voz los dice en ese orden, así que el tiempo de cada uno se
 * reparte según su largo: no es exacto a la sílaba, pero el texto en pantalla
 * va con lo que se está escuchando.
 */
function tramos(paso: PasoCapacitacion, total: number) {
  const partes = [
    { titulo: paso.titulo, texto: paso.texto },
    ...paso.puntos.map((p, i) => ({ titulo: `${i + 1} de ${paso.puntos.length}`, texto: p })),
  ];
  const largo = textoDelPaso(paso).length;
  let desde = 0;
  return partes.map((p) => {
    const dura = (total * (p.titulo.length + p.texto.length + 30)) / (largo + 30 * partes.length);
    const t = { ...p, desde, hasta: desde + dura };
    desde += dura;
    return t;
  });
}

/** Lo que se le agrega a la pantalla mientras graba: subtítulo y marca del menú. */
async function prepararPantalla(page: Page, paso: PasoCapacitacion) {
  await page.addStyleTag({
    content: `
      /* Nada que tape: la burbuja de ayuda y el aviso de versión nueva. */
      [aria-label="Ayuda: preguntar o ver un video"], [data-aviso-version] { display: none !important; }
      #cap-sub { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 99999;
        width: min(980px, calc(100vw - 48px)); background: rgba(9, 22, 40, .92); color: #fff;
        border-radius: 14px; padding: 14px 20px 16px; font: 500 17px/1.45 system-ui, sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,.35); border: 1px solid rgba(46, 204, 113, .45); }
      #cap-sub b { display: block; font-size: 12px; letter-spacing: .12em; text-transform: uppercase;
        color: #4ade80; margin-bottom: 4px; }
      #cap-barra { position: fixed; left: 0; top: 0; height: 4px; background: #22c55e; z-index: 99999; width: 0; }
      .cap-marca { outline: 3px solid #22c55e !important; outline-offset: 2px; border-radius: 10px; }
    `,
  });
  await page.evaluate((ruta: string) => {
    const sub = document.createElement("div");
    sub.id = "cap-sub";
    document.body.appendChild(sub);
    const barra = document.createElement("div");
    barra.id = "cap-barra";
    document.body.appendChild(barra);
    const camino = ruta.split("?")[0];
    const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("aside a, nav a")).find(
      (a) => new URL(a.href).pathname === camino,
    );
    link?.classList.add("cap-marca");
    link?.scrollIntoView({ block: "center" });
  }, paso.ruta);
}

async function grabarPaso(page: Page, paso: PasoCapacitacion, base: string, segundos: number, webm: string) {
  await page.goto(`${base}${paso.ruta}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  // Que termine de cargar: las pantallas grandes muestran el logo girando
  // mientras cruzan datos. Se espera a que no quede ningún «cargando».
  await page
    .waitForFunction(() => !document.querySelector('[aria-busy="true"], [data-cargando]'), { timeout: 90_000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 3500));
  // Si la pantalla rebotó (el usuario que graba no tiene ese permiso, por
  // ejemplo Nómina), no se graba: sería un video del Panel con la voz de otra
  // sección.
  const llego = new URL(page.url()).pathname;
  if (llego !== paso.ruta.split("?")[0]) throw new Redirigido(`${paso.ruta} rebotó a ${llego}`);
  // Algunas pantallas rebotan desde el navegador, un instante después: eso
  // aparece como que la página se fue mientras se le agregaba el subtítulo.
  try {
    await prepararPantalla(page, paso);
  } catch (e) {
    if (e instanceof Error && /context was destroyed|navigation/i.test(e.message)) {
      throw new Redirigido(`${paso.ruta} rebotó a ${new URL(page.url()).pathname}`);
    }
    throw e;
  }

  const partes = tramos(paso, segundos);
  const grabacion = await page.screencast({ path: webm as `${string}.webm`, ffmpegPath: herramienta("ffmpeg") });
  const inicio = Date.now();
  try {
    for (let i = 0; i < partes.length; i++) {
      const t = partes[i];
      await page.evaluate(
        (titulo: string, texto: string, fraccion: number, total: number) => {
          const sub = document.getElementById("cap-sub");
          if (sub) {
            sub.innerHTML = "";
            const b = document.createElement("b");
            b.textContent = titulo;
            sub.append(b, document.createTextNode(texto));
          }
          // La pantalla baja al ritmo de la voz: el primer tramo arriba, el
          // último al final. Así se ve la pantalla entera y no solo el encabezado.
          const alto = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo({ top: total > 1 ? (alto * fraccion) / (total - 1) : 0, behavior: "smooth" });
        },
        t.titulo,
        t.texto,
        i,
        partes.length,
      );
      // Barra de progreso del paso.
      const hasta = inicio + t.hasta * 1000;
      while (Date.now() < hasta) {
        const avance = Math.min(1, (Date.now() - inicio) / 1000 / segundos);
        await page.evaluate((a: number) => {
          const barra = document.getElementById("cap-barra");
          if (barra) barra.style.width = `${a * 100}%`;
        }, avance);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  } finally {
    await grabacion.stop();
  }
}

async function main() {
  const base = argumento("url") ?? "http://localhost:3481";
  const token = process.env.JARVIS_TOKEN;
  if (!token) throw new Error("Falta JARVIS_TOKEN (la cookie jarvis_session de un usuario dueño).");
  const solo = argumento("solo")?.split(",").filter(Boolean) ?? null;
  const todos = process.argv.includes("--todos");

  mkdirSync(SALIDA, { recursive: true });
  const manifiesto: Record<string, EntradaVideo> = existsSync(MANIFIESTO)
    ? JSON.parse(readFileSync(MANIFIESTO, "utf8"))
    : {};
  const voces = JSON.parse(readFileSync(join(AUDIO, "manifiesto.json"), "utf8")) as Record<
    string,
    { archivo: string; huella: string }
  >;

  const pasos = pasosParaUsuario({ rol: "OWNER", vePayroll: true, veCifras: true }).filter(
    (p) => !solo || solo.includes(p.id),
  );

  const navegador = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    defaultViewport: { width: ANCHO, height: ALTO, deviceScaleFactor: 1 },
    args: [`--window-size=${ANCHO},${ALTO}`],
  });
  const saltados: string[] = [];
  try {
    const page = await navegador.newPage();
    const { hostname } = new URL(base);
    await navegador.setCookie({ name: "jarvis_session", value: token, domain: hostname, path: "/", httpOnly: true });
    // Sin la pantalla de bienvenida del día encima. La clave se calcula en
    // cada carga y no una vez al arrancar: una tanda que cruza la medianoche
    // de Ecuador grababa el resto de los videos con la bienvenida tapándolos.
    // Es la misma cuenta que `claveDelDia` (hora de Ecuador, UTC−5).
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("arranque-visto", new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));
        // Ni la ayuda que se abre sola la primera vez en algunas pantallas
        // (ayuda-pantalla.tsx): taparía todo el video.
        for (const id of ["sin-nomenclatura", "ficha-producto"]) localStorage.setItem(`ayuda:${id}`, "1");
      } catch {}
    });

    for (const paso of pasos) {
      const texto = textoDelPaso(paso);
      const huella = huellaDeTexto(texto);
      if (!todos && manifiesto[paso.id]?.huella === huella && existsSync(join(SALIDA, manifiesto[paso.id].archivo))) {
        console.log(`= ${paso.id}: ya está al día`);
        continue;
      }
      const voz = voces[paso.id];
      if (!voz || voz.huella !== huella) {
        saltados.push(paso.id);
        console.log(`! ${paso.id}: la voz no corresponde al texto actual; grabar primero la locución`);
        continue;
      }
      const mp3 = join(AUDIO, voz.archivo);
      const segundos = segundosDe(mp3) / VELOCIDAD;
      const webm = join(SALIDA, `${paso.id}.tmp.webm`);
      const mp4 = join(SALIDA, `${paso.id}.mp4`);
      const jpg = join(SALIDA, `${paso.id}.jpg`);
      console.log(`> ${paso.id}: ${segundos.toFixed(0)} s`);
      try {
        await grabarPaso(page, paso, base, segundos, webm);
      } catch (e) {
        if (!(e instanceof Redirigido)) throw e;
        saltados.push(paso.id);
        console.log(`! ${paso.id}: ${e.message}; grabar con un usuario que tenga ese permiso`);
        continue;
      }

      // La voz a 1,25x con atempo (no cambia el tono) y video liviano: el
      // equipo lo abre desde el celular.
      execFileSync(herramienta("ffmpeg"), [
        "-y", "-loglevel", "error",
        "-i", webm, "-i", mp3,
        "-filter:a", `atempo=${VELOCIDAD}`,
        "-vf", `fps=24,scale=${ANCHO}:-2`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "64k", "-ac", "1",
        "-shortest", "-movflags", "+faststart",
        mp4,
      ]);
      execFileSync(herramienta("ffmpeg"), ["-y", "-loglevel", "error", "-ss", "2", "-i", mp4, "-frames:v", "1", "-q:v", "6", jpg]);
      unlinkSync(webm);

      manifiesto[paso.id] = {
        archivo: `${paso.id}.mp4`,
        huella,
        segundos: Math.round(segundosDe(mp4)),
        poster: `${paso.id}.jpg`,
        generado: new Date().toISOString(),
      };
      writeFileSync(MANIFIESTO, JSON.stringify(manifiesto, null, 2) + "\n");
      console.log(`  ${(statSync(mp4).size / 1e6).toFixed(1)} MB`);
    }
  } finally {
    await navegador.close();
  }
  if (saltados.length) console.log(`\nSin video por falta de voz al día: ${saltados.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
