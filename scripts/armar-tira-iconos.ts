/**
 * Junta las piezas de sección en una sola imagen.
 *
 * POR QUÉ UNA TIRA Y NO VEINTIÚN ARCHIVOS. Cada pieza pesa dos kilobytes —ya
 * en WebP y a 80 píxeles— pero son diecinueve peticiones al servidor, y eso
 * tiene un piso que no se baja comprimiendo: medido en vivo, la última llegaba
 * seiscientos milisegundos después de que la pantalla estuviera lista. En una
 * sola imagen es una petición, y el navegador la cachea entera.
 *
 * LA TIRA ES VERTICAL Y EL ORDEN IMPORTA. Cada pieza se muestra corriendo el
 * fondo hacia arriba: la número N va en `-N × tamaño` píxeles. El orden de
 * `PIEZAS` es ese índice, así que agregar una al medio corre todas las de
 * abajo. Se agregan AL FINAL, siempre.
 *
 * Después de correr esto hay que copiar la lista que imprime a `PIEZAS` en
 * `src/app/dashboard/icono-seccion.tsx`: son dos lugares con el mismo orden y
 * la única forma de que no se separen es que el script lo diga en voz alta.
 *
 *   npx tsx scripts/armar-tira-iconos.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * De dónde salen las piezas, y dónde queda la tira.
 *
 * Las fuentes viven en `assets/` y no en `public/`: ahí quedan versionadas sin
 * que el servidor las sirva. Se guardan a 160 px, el doble de la tira, para
 * poder rehacerla más grande el día que haga falta sin cargar el repositorio
 * con los veintiún megas de los originales de 1024.
 */
const FUENTES = path.join(process.cwd(), "assets", "iconos");
const DESTINO = path.join(process.cwd(), "public", "iconos");
/** El lado de cada pieza dentro de la tira. */
const LADO = 80;

/**
 * El orden de la tira.
 *
 * Escrito a mano y no leído del directorio: `readdir` ordena distinto según el
 * sistema de archivos, así que un día la tira saldría en otro orden y cada
 * sección mostraría el ícono de otra, sin que falle nada.
 */
const PIEZAS = [
  "panel",
  "ceo",
  "contenido",
  "productos",
  "sin-nomenclatura",
  "control",
  "rentabilidad",
  "clientes",
  "origen",
  "calculadora",
  "pagos",
  "reportes",
  "logistica",
  "nomina",
  "chat",
  "notificaciones",
  "jarvis",
  "conexiones",
  "configuracion",
  "usuarios",
  "desempeno",
];

async function main() {
  const faltan = PIEZAS.filter((n) => !fs.existsSync(path.join(FUENTES, `${n}.webp`)));
  if (faltan.length > 0) {
    console.error("Faltan piezas:", faltan.join(", "));
    process.exit(1);
  }

  const capas = await Promise.all(
    PIEZAS.map(async (nombre, i) => ({
      input: await sharp(path.join(FUENTES, `${nombre}.webp`)).resize(LADO, LADO).toBuffer(),
      top: i * LADO,
      left: 0,
    })),
  );

  const destino = path.join(DESTINO, "piezas.webp");
  await sharp({
    create: {
      width: LADO,
      height: LADO * PIEZAS.length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(capas)
    .webp({ quality: 88, effort: 6 })
    .toFile(destino);

  const kb = Math.round(fs.statSync(destino).size / 1024);
  console.log(`tira: ${LADO}x${LADO * PIEZAS.length} px · ${kb} KB · ${PIEZAS.length} piezas`);
  console.log(`se sirve en UNA petición, no en ${PIEZAS.length}`);
  console.log("\nEl orden para `PIEZAS` en icono-seccion.tsx:\n");
  console.log(PIEZAS.map((n) => `  "${n}",`).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
