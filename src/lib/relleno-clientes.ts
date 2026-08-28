import { db } from "@/lib/db";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";

// Rellenar hacia atrás los datos del cliente en las órdenes viejas.
//
// El teléfono, el nombre y la provincia se empezaron a guardar después de que
// ya había 79.000 órdenes en la base. Esas quedaron anónimas, y sobre el
// teléfono se apoya justamente la identificación de quién repite: sin él, la
// pantalla de clientes describe al 14% de la operación y parece la verdad.
//
// Los tres intentos anteriores se hicieron por HTTP y murieron todos igual: la
// petición se pasaba del tiempo del proxy, o un despliegue mataba el proceso a
// mitad de camino y se volvía a empezar de cero.
//
// Por eso esto corre DENTRO del reloj y por pedazos, anotando en la base hasta
// dónde llegó. Un despliegue ahora cuesta un pedazo, no la corrida entera.

/** Hasta dónde retrocede. La tienda no tiene órdenes más viejas que esto. */
const DIAS_MAXIMOS = 400;

/** Días por pedazo. Con la escritura por lotes son ~8 consultas de base. */
const DIAS_POR_PEDAZO = 30;

/**
 * Cuánto puede durar una vuelta. El reloj dispara cada 5 minutos: si el relleno
 * se queda con la vuelta entera, la sincronización normal —la que mantiene el
 * panel al día— nunca corre.
 */
const PRESUPUESTO_MS = 2 * 60 * 1000;

const FUENTE = "relleno-clientes";

type Estado = { diasHechos: number; terminado: boolean };

function leerEstado(detalle: string | null): Estado {
  if (!detalle) return { diasHechos: 0, terminado: false };
  try {
    const j = JSON.parse(detalle) as Partial<Estado>;
    return {
      diasHechos: typeof j.diasHechos === "number" ? j.diasHechos : 0,
      terminado: j.terminado === true,
    };
  } catch {
    // Un detalle viejo en texto plano no es un error: es un relleno que
    // empieza de cero.
    return { diasHechos: 0, terminado: false };
  }
}

/**
 * Avanza un rato en el relleno y devuelve qué hizo, o null si ya no hay nada
 * que hacer.
 */
export async function rellenarClientes(organizationId: string) {
  let fila = await db.syncState.findFirst({
    where: { organizationId, fuente: FUENTE },
  });

  const estado = leerEstado(fila?.detalle ?? null);
  if (estado.terminado) return null;

  const tiendas = await db.shopifyStore.findMany({
    where: { organizationId, connectedAt: { not: null } },
    select: { id: true },
  });
  if (tiendas.length === 0) return null;

  const arranque = Date.now();
  let diasHechos = estado.diasHechos;
  let pedazos = 0;
  let ordenes = 0;

  while (diasHechos < DIAS_MAXIMOS && Date.now() - arranque < PRESUPUESTO_MS) {
    // Se avanza de atrás hacia adelante en el tiempo: `hasta` es el corte
    // superior de la ventana y `dias` su ancho.
    const hasta = new Date();
    hasta.setDate(hasta.getDate() - diasHechos);
    const ancho = Math.min(DIAS_POR_PEDAZO, DIAS_MAXIMOS - diasHechos);

    for (const tienda of tiendas) {
      const r = await syncShopifyStore(
        tienda.id,
        ancho,
        hasta.toISOString().slice(0, 10),
        true // forzar: es justamente reescribir lo que ya estaba
      );
      ordenes += r.ordersSynced;
    }

    diasHechos += ancho;
    pedazos++;

    // Se anota después de CADA pedazo, no al final. Si el proceso se muere
    // aquí, la próxima vuelta sigue desde este punto.
    const detalle = JSON.stringify({
      diasHechos,
      terminado: diasHechos >= DIAS_MAXIMOS,
    } satisfies Estado);

    if (fila) {
      await db.syncState.update({
        where: { id: fila.id },
        data: { detalle, okAt: new Date(), error: null, errorAt: null },
      });
    } else {
      const creada = await db.syncState.create({
        data: { organizationId, fuente: FUENTE, detalle, okAt: new Date() },
      });
      fila = creada;
    }
  }

  return `${pedazos} pedazos, ${ordenes} órdenes, ${diasHechos}/${DIAS_MAXIMOS} días`;
}
