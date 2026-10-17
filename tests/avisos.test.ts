// Regresión del calendario del resumen de progreso (15 y fin de mes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { erroresDelResumen } from "@/lib/scheduler";
import { avisoDeCuentasCalladas, decidirCallada } from "@/lib/cuentas-calladas";
import { periodoAnterior, periodoQueCierra } from "@/lib/progreso-quincenal";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

test("el 15 cierra la primera quincena", () => {
  const p = periodoQueCierra(d("2026-09-15"))!;
  assert.equal(iso(p.desde), "2026-09-01");
  assert.equal(iso(p.hasta), "2026-09-15");
  assert.equal(p.texto, "1 al 15 de septiembre");
});

test("el último día cierra la segunda quincena (30, 31 y febrero)", () => {
  assert.equal(periodoQueCierra(d("2026-09-30"))!.texto, "16 al 30 de septiembre");
  assert.equal(periodoQueCierra(d("2026-10-31"))!.texto, "16 al 31 de octubre");
  assert.equal(periodoQueCierra(d("2027-02-28"))!.texto, "16 al 28 de febrero");
  assert.equal(periodoQueCierra(d("2026-09-29")), null);
  assert.equal(periodoQueCierra(d("2026-10-30")), null);
});

test("un día cualquiera no manda nada", () => {
  assert.equal(periodoQueCierra(d("2026-09-19")), null);
});

test("la comparación es contra la quincena anterior, cruzando mes y año", () => {
  const a = periodoAnterior(periodoQueCierra(d("2026-09-30"))!);
  assert.deepEqual([iso(a.desde), iso(a.hasta)], ["2026-09-01", "2026-09-15"]);
  const b = periodoAnterior(periodoQueCierra(d("2026-09-15"))!);
  assert.deepEqual([iso(b.desde), iso(b.hasta)], ["2026-08-16", "2026-08-31"]);
  const c = periodoAnterior(periodoQueCierra(d("2027-01-15"))!);
  assert.deepEqual([iso(c.desde), iso(c.hasta)], ["2026-12-16", "2026-12-31"]);
});

// ---------------------------------------------------------------------------
// Qué deja una vuelta del reloj marcada en rojo.

test("una parte que dice «error:» pinta la vuelta de rojo", () => {
  const r = erroresDelResumen({
    facebook: "41 campañas, 0 días cambiados",
    correo: "error: Falta la clave de Resend",
  });
  assert.ok(r, "tendría que haber marcado error");
  assert.match(r, /correo/);
  assert.match(r, /Falta la clave de Resend/);
  // El prefijo «error:» no se repite dentro del mensaje: ya lo dice el estado.
  assert.ok(!/error:/i.test(r), `arrastró el prefijo: ${r}`);
});

test("una vuelta sana no se marca", () => {
  assert.equal(
    erroresDelResumen({
      facebook: "41 campañas, 0 días cambiados",
      shopify: "790 órdenes",
    }),
    null,
  );
});

test("la palabra error dentro de una frase no cuenta", () => {
  // «sin errores» y «0 errores» son buenas noticias; solo cuenta cuando el
  // texto EMPIEZA diciendo que falló, que es como lo escriben las partes.
  assert.equal(erroresDelResumen({ notion: "316 actividades, sin errores" }), null);
  assert.equal(erroresDelResumen({ cierres: "248 filas, 0 errores" }), null);
});

// ---------------------------------------------------------------------------
// La tira de iconos: dos listas que tienen que decir lo mismo.

test("el orden de la tira es el mismo en el componente y en el script", async () => {
  // Las veintiuna piezas viven en una sola imagen y cada seccion muestra la
  // porcion que le toca segun su posicion en el arreglo. El mismo orden esta
  // escrito en dos archivos: el componente que las pinta y el script que arma
  // la imagen. Si se separan, cada seccion muestra el icono de OTRA y no falla
  // nada -- no hay excepcion, no hay 404, solo iconos cambiados que alguien
  // tiene que notar a ojo.
  const fs = await import("node:fs/promises");
  const lista = async (ruta: string) => {
    const texto = await fs.readFile(ruta, "utf8");
    const bloque = texto.slice(texto.indexOf("const PIEZAS = ["));
    const cierre = bloque.indexOf("]");
    return [...bloque.slice(0, cierre).matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  };

  const enElComponente = await lista("src/app/dashboard/icono-seccion.tsx");
  const enElScript = await lista("scripts/armar-tira-iconos.ts");

  assert.ok(enElComponente.length >= 20, `se leyeron ${enElComponente.length} piezas`);
  assert.deepEqual(
    enElComponente,
    enElScript,
    "el orden de PIEZAS se separo entre el componente y el script: cada seccion mostraria el icono de otra",
  );
});

test("la tira servida tiene una franja por pieza", async () => {
  const fs = await import("node:fs/promises");
  const texto = await fs.readFile("src/app/dashboard/icono-seccion.tsx", "utf8");
  const bloque = texto.slice(texto.indexOf("const PIEZAS = ["));
  const cuantas = [...bloque.slice(0, bloque.indexOf("]")).matchAll(/"([a-z-]+)"/g)].length;

  // La imagen es una columna de cuadrados: su alto tiene que ser exactamente
  // el ancho por la cantidad de piezas. Si no, las porciones salen corridas y
  // cada icono muestra media pieza.
  const datos = await fs.readFile("public/iconos/piezas.webp");
  // Cabecera WebP/VP8L: el tamano vive en los bytes 26 en adelante del bloque
  // VP8X, o se puede leer del VP8 simple. Se usa el chunk VP8X, que es el que
  // escribe sharp para imagenes con alfa.
  const esVP8X = datos.toString("ascii", 12, 16) === "VP8X";
  assert.ok(esVP8X, "la tira deberia tener alfa (chunk VP8X)");
  const ancho = (datos.readUIntLE(24, 3) & 0xffffff) + 1;
  const alto = (datos.readUIntLE(27, 3) & 0xffffff) + 1;
  assert.equal(alto, ancho * cuantas, `la tira mide ${ancho}x${alto} para ${cuantas} piezas`);
});

test("toda pieza que el menu o el encabezado piden esta en la tira", async () => {
  // Un nombre que no esta en la tira no revienta: la seccion se queda con el
  // cuadro verde y sin objeto blanco. Eso se ve, pero solo lo ve quien tenga
  // permiso para entrar a esa seccion -- Nomina y Desempeno, por ejemplo, no
  // le aparecen al dueno, asi que una pieza faltante ahi podria vivir meses.
  // Por eso se compara por codigo: lo que PIDEN los dos consumidores -- el
  // menu y el encabezado -- contra lo que la tira TIENE.
  const fs = await import("node:fs/promises");

  const componente = await fs.readFile("src/app/dashboard/icono-seccion.tsx", "utf8");
  const bloque = componente.slice(componente.indexOf("const PIEZAS = ["));
  const enLaTira = new Set(
    [...bloque.slice(0, bloque.indexOf("]")).matchAll(/"([a-z-]+)"/g)].map((m) => m[1]),
  );

  const menu = await fs.readFile("src/app/dashboard/sidebar-nav.tsx", "utf8");
  const pedidasPorElMenu = [...menu.matchAll(/icon:\s*"([a-z-]+)"/g)].map((m) => m[1]);

  const rutas = await fs.readFile("src/app/dashboard/icono-de-ruta.tsx", "utf8");
  const pedidasPorLaRuta = [...rutas.matchAll(/\["\/dashboard[^"]*",\s*"([a-z-]+)"\]/g)].map(
    (m) => m[1],
  );

  assert.ok(pedidasPorElMenu.length >= 20, `el menu pide ${pedidasPorElMenu.length} piezas`);
  assert.ok(pedidasPorLaRuta.length >= 20, `las rutas piden ${pedidasPorLaRuta.length} piezas`);

  const faltan = [...new Set([...pedidasPorElMenu, ...pedidasPorLaRuta])].filter(
    (n) => !enLaTira.has(n),
  );
  assert.deepEqual(faltan, [], `estas piezas se piden y no estan en la tira: ${faltan.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Cuentas publicitarias que se callan: la alarma que faltaba.

test("una cuenta que venia gastando y dejo de traer datos se marca", () => {
  // El caso real: CP1 Top Ventas, la que mas gastaba de las doce, gasto $437
  // el 12 de octubre y no entrego una sola fila mas. El 17 lleva 5 dias.
  assert.equal(decidirCallada(5, 5), true);
  // CP3 Top Ventas: ultimo dato y ultimo gasto el 13.
  assert.equal(decidirCallada(4, 4), true);
  // CP4 Bellav: dejo de traer el 11, pero su ultimo gasto fue el 7 -- sigue
  // dentro de la ventana, asi que tambien cuenta.
  assert.equal(decidirCallada(6, 10), true);
});

test("una cuenta apagada hace tiempo no es una alarma", () => {
  // CP5 Bellav: sin datos hace 13 dias, sin gastar hace 19. Nadie la esta
  // usando; avisar por ella dejaria el tablero rojo para siempre, y un rojo
  // permanente es un rojo que se ignora.
  assert.equal(decidirCallada(13, 19), false);
  // CP3 Mundo Hogar: junio.
  assert.equal(decidirCallada(136, 143), false);
  // Cuentas de TikTok que traen filas todos los dias pero hace semanas que no
  // gastan: traen datos, solo que en cero. No hay nada roto.
  assert.equal(decidirCallada(1, 26), false);
  // Una cuenta que nunca gasto no tiene con que comparar.
  assert.equal(decidirCallada(6, null), false);
});

test("un dia de atraso no dispara la alarma", () => {
  // A las doce y cinco de la noche el dia en curso recien empieza: el ultimo
  // dato es el de ayer y esta todo bien. Si se comparara contra hoy, la
  // alarma sonaria todas las madrugadas y en una semana nadie la miraria.
  assert.equal(decidirCallada(1, 1), false);
  assert.equal(decidirCallada(0, 0), false);
  assert.equal(decidirCallada(2, 2), true);
});

test("el aviso nombra las cuentas, no dice solo que hay cuentas", () => {
  const texto = avisoDeCuentasCalladas(
    [
      {
        id: "a",
        nombre: "CP1 - Top Ventas",
        platform: "META",
        ultimoDia: "2026-10-12",
        ultimoDiaConGasto: "2026-10-12",
        diasSinDatos: 5,
        callada: true,
      },
      {
        id: "b",
        nombre: "CP2 - Bellav Corp",
        platform: "META",
        ultimoDia: "2026-10-16",
        ultimoDiaConGasto: "2026-10-16",
        diasSinDatos: 1,
        callada: false,
      },
    ],
    "META",
  );
  // Un "hay cuentas sin datos" obliga a abrir otra pantalla para saber
  // cuales, y en la practica eso significa que nadie la abre.
  assert.ok(texto?.includes("CP1 - Top Ventas"), texto ?? "no aviso");
  assert.ok(!texto?.includes("CP2"), "no deberia nombrar a las sanas");
  assert.ok(texto?.includes("Windsor"), "tiene que decir donde se arregla");
});

test("sin cuentas calladas no hay aviso", () => {
  assert.equal(avisoDeCuentasCalladas([]), null);
});
