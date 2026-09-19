// Memoria compartida para los cálculos pesados de las pantallas.
//
// POR QUÉ
// El panel, CEO, Reportes, Clientes, Control y Rentabilidad cruzan miles de
// órdenes y métricas en cada apertura: entre uno y cuatro segundos. Y lo que
// calculan es lo mismo para todo el equipo —los números de la organización—,
// que además solo cambian cuando corre la sincronización (cada 5 minutos) o
// cuando alguien edita algo. Recalcularlo para cada persona y en cada clic era
// trabajo repetido.
//
// CUÁNDO SE INVALIDA
// La memoria no tiene un "vence en X minutos" que pueda mostrar datos viejos:
// se tira ENTERA en cuanto la aplicación escribe en la base (ver db.ts:
// cualquier create/update/delete/upsert, SQL crudo o transacción). Así:
//   - termina un sync de Shopify o de Windsor → la próxima apertura recalcula;
//   - alguien enlaza un pedido o carga la economía del mes → idem.
// Se excluyen las escrituras que no cambian ningún número (chat, presencia de
// voz, notificaciones, lecturas de anuncios, el registro de actividad).
//
// Igual lleva un vencimiento de seguridad de 10 minutos, por si una escritura
// entra por un camino que no pasa por el cliente de la app.
//
// CUIDADOS
// - Cada lectura recibe su propia COPIA (structuredClone): una pantalla que
//   ordene o recorte el resultado no puede alterar lo que ve el siguiente.
// - Dos pedidos iguales al mismo tiempo comparten un solo cálculo.
// - Si hubo una escritura MIENTRAS se calculaba, el resultado se entrega pero
//   no se guarda: podría haber leído la mitad de los datos nuevos.
// - Vive en la memoria del proceso: la app corre en una sola instancia de
//   Railway. Con varias réplicas, cada una tendría la suya (sigue siendo
//   correcto, solo rinde menos).

const VENCE_MS = 10 * 60 * 1000;
const MAXIMO = 300;

let generacion = 0;
const guardado = new Map<string, { gen: number; hasta: number; valor: unknown }>();
const enCurso = new Map<string, { gen: number; promesa: Promise<unknown> }>();

/** Algo cambió en la base: todo lo calculado hasta ahora deja de valer. */
export function invalidarMemoria() {
  generacion++;
  guardado.clear();
}

function clave(nombre: string, args: unknown[]) {
  return `${nombre}:${JSON.stringify(args)}`;
}

/**
 * Envuelve una función de lectura pesada para que su resultado se comparta
 * hasta la próxima escritura en la base. Los argumentos tienen que ser
 * serializables a JSON (ids, rangos de fechas, banderas).
 */
export function memorizar<A extends unknown[], R>(nombre: string, fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    if (process.env.MEMORIA_APAGADA === "1") return fn(...args);

    const k = clave(nombre, args);
    const ahora = Date.now();
    const g = guardado.get(k);
    if (g && g.gen === generacion && g.hasta > ahora) return structuredClone(g.valor as R);

    const curso = enCurso.get(k);
    if (curso && curso.gen === generacion) return structuredClone((await curso.promesa) as R);

    const genInicio = generacion;
    const promesa = fn(...args);
    enCurso.set(k, { gen: genInicio, promesa });
    try {
      const valor = await promesa;
      if (generacion === genInicio) {
        if (guardado.size >= MAXIMO) guardado.delete(guardado.keys().next().value as string);
        guardado.set(k, { gen: genInicio, hasta: Date.now() + VENCE_MS, valor });
      }
      return structuredClone(valor);
    } finally {
      if (enCurso.get(k)?.promesa === promesa) enCurso.delete(k);
    }
  };
}
