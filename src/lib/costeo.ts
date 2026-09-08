/**
 * El modelo de costeo en dólares: qué deja de verdad un producto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE
 * ─────────────────────────────────────────────────────────────────────────────
 * Es la calculadora de rentabilidad que la agencia ya usa en otro proyecto,
 * traída acá y pasada a dólares para Ecuador. Se pidió así —"equivalente a la
 * de otro proyecto"— y equivalente significa las mismas cuentas, no una
 * parecida: si las dos herramientas dieran resultados distintos para el mismo
 * producto, la discusión pasaría a ser cuál de las dos miente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE QUE NO HAGA LA CALCULADORA DE PRECIOS QUE YA ESTABA
 * ─────────────────────────────────────────────────────────────────────────────
 * La de precios responde "a cuánto vendo". Esta responde "cuánto me queda", que
 * es otra pregunta y tiene dos piezas que aquella no modela:
 *
 *  1. **La pauta entra en el costo unitario.** Toda la publicidad del día —la
 *     de los pedidos que se cancelaron y la de los que se devolvieron incluida—
 *     se carga sobre las unidades que sí se cobran. Por eso el margen real
 *     queda muy por debajo del bruto, y por eso las calculadoras de internet
 *     dan una "ganancia por unidad" inflada.
 *  2. **El mes sale de las mismas fórmulas que el día**, no de porcentajes
 *     escritos a mano. Cambiar la efectividad mueve el mes entero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CAMBIÓ AL PASARLO A DÓLARES
 * ─────────────────────────────────────────────────────────────────────────────
 *  · La cifra comercial. En pesos se redondea a múltiplos de cinco mil menos
 *    cien; acá el escalón es de cinco dólares menos diez centavos, que es cómo
 *    se publican los precios en Ecuador: $29,90 · $39,90 · $44,90.
 *  · Se cayó el aviso de "escríbelo en pesos completos". Nacía de que allá el
 *    CPA se teclea en miles; acá un CPA de $8 es un CPA de $8 y avisar de eso
 *    sería ruido.
 *  · Los valores de fábrica son de contraentrega en Ecuador, no del ejemplo del
 *    otro proyecto. Igual casi nunca se usan: la pantalla arranca cargando un
 *    producto real de la tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS EXTENSIONES Y POR QUÉ ARRANCAN EN CERO
 * ─────────────────────────────────────────────────────────────────────────────
 * La comisión de recaudo, el empaque, la llamada de confirmación, el flete de
 * retorno, la mercancía que vuelve rota y los gastos fijos existen todos acá y
 * valen cero por defecto. Quien los conozca los enciende. Ponerles un valor
 * "realista" inventado por nosotros haría que esta calculadora y la del otro
 * proyecto se contradijeran el primer día para el mismo caso.
 */

/* ------------------------------- Las entradas ----------------------------- */

export type EntradaCosteo = {
  /* — Paso 1: el producto — */
  /** A cuánto se vende un pedido. */
  pvp: number;
  /** Lo que se le paga al proveedor por lo que va en un pedido. */
  costoProducto: number;
  /** Flete de ida, por pedido despachado. Se paga aunque el paquete vuelva. */
  fletePromedio: number;

  /* — Paso 2: la operación — */
  /** Pedidos que entran al día, entregados o no. */
  pedidosDia: number;
  /** Porcentaje que se cae antes de despachar. */
  pctCancelacion: number;
  /**
   * Porcentaje que se despacha y vuelve, sobre los pedidos GENERADOS.
   *
   * Sobre generados y no sobre despachados: es la convención del modelo, y la
   * pantalla lo dice al lado del campo porque la transportadora reporta las
   * devoluciones sobre despachos. Cuando el dato entra desde la ficha de un
   * producto —donde las devoluciones SÍ están sobre lo despachado— se convierte
   * antes de llegar acá; ver `desdeLaFicha`.
   */
  pctDevolucion: number;

  /* — Paso 3: la pauta — */
  /** Qué parte del margen real se destina a anuncios. */
  pctPauta: number;
  /** El CPA que la subasta está cobrando HOY, por pedido generado. */
  cpaActual: number;

  /* — El mes — */
  /** Días de operación al mes. */
  diasMes: number;

  /* — Extensiones. Cero (o 100) = el modelo básico — */
  /** Lo que cobra la transportadora por devolver el paquete. */
  fleteRetornoDevolucion: number;
  /** Qué parte de lo devuelto vuelve vendible. */
  pctRecuperacionMercancia: number;
  /** Comisión de recaudo contraentrega, sobre lo entregado. */
  pctComisionRecaudo: number;
  /** Empaque y etiqueta, por pedido despachado. */
  costoEmpaquePorDespacho: number;
  /** La llamada o el WhatsApp de confirmación, por pedido GENERADO. */
  costoConfirmacionPorPedido: number;
  /** Nómina, arriendo, plataformas. Al mes. */
  gastosFijosMes: number;
  /** Días que tarda la transportadora en consignar. Solo afecta a la caja. */
  diasCartera: number;
};

/** Un caso de contraentrega en Ecuador, para que la pantalla nunca abra vacía. */
export const COSTEO_POR_DEFECTO: EntradaCosteo = {
  pvp: 39.9,
  costoProducto: 9,
  fletePromedio: 5,
  pedidosDia: 10,
  pctCancelacion: 20,
  pctDevolucion: 20,
  pctPauta: 35,
  cpaActual: 8,
  diasMes: 30,

  fleteRetornoDevolucion: 0,
  pctRecuperacionMercancia: 100,
  pctComisionRecaudo: 0,
  costoEmpaquePorDespacho: 0,
  costoConfirmacionPorPedido: 0,
  gastosFijosMes: 0,
  diasCartera: 12,
};

/**
 * Carga la calculadora con la economía real de un producto de la tienda.
 *
 * Acá vive la única traducción delicada de todo el archivo. La ficha del
 * producto guarda `efectividad` —qué parte de los checkouts se confirma— y
 * `devoluciones` sobre lo DESPACHADO, en cascada. Este modelo pregunta las dos
 * cosas sobre los pedidos GENERADOS. Pasarlas tal cual haría que un producto
 * con 60% de efectividad y 20% de devoluciones mostrara 20% de pérdida por
 * devolución cuando la real es 12%, y con ella se movería el margen entero.
 *
 * La cuenta que tiene que quedar igual en los dos lados es la de entregados:
 * `efectividad × (1 − devoluciones)` allá, `1 − cancelación − devolución` acá.
 */
export function desdeLaFicha(
  base: EntradaCosteo,
  ficha: {
    salePrice: number | null;
    unitCost: number | null;
    flete: number | null;
    efectividad: number | null;
    devoluciones: number | null;
    cpaTarget?: number | null;
  },
): EntradaCosteo {
  const efectividad = ficha.efectividad ?? 1;
  const devueltoDeLoDespachado = ficha.devoluciones ?? 0;

  return {
    ...base,
    pvp: ficha.salePrice ?? base.pvp,
    costoProducto: ficha.unitCost ?? base.costoProducto,
    fletePromedio: ficha.flete ?? base.fletePromedio,
    pctCancelacion: (1 - efectividad) * 100,
    // Sobre generados: de cada 100 pedidos, `efectividad` se despachan y de
    // esos vuelve `devoluciones`.
    pctDevolucion: efectividad * devueltoDeLoDespachado * 100,
    cpaActual: ficha.cpaTarget && ficha.cpaTarget > 0 ? ficha.cpaTarget : base.cpaActual,
  };
}

/* ------------------------------ Los resultados ---------------------------- */

/** Un escalón de la oferta: una unidad, dos o tres. */
export type TramoDePrecio = {
  unidades: number;
  /** Lo que se cobra por el pack, ya redondeado a cifra publicable. */
  precio: number;
  /** Lo que cuesta ese pack: las unidades más UN flete. */
  costo: number;
  margen: number;
  pctMargen: number;
  /** Lo que se ahorra frente a comprar esas unidades sueltas. */
  ahorro: number;
  pctAhorro: number;
};

export type EscenarioPauta = {
  /** 35, 40 o 50. */
  pct: number;
  presupuesto: number;
  cpaMaximo: number;
  utilidadOperacional: number;
  /** El 35% es la regla; se marca. */
  recomendado: boolean;
};

export type ResultadoCosteo = {
  producto: {
    /** Producto + flete: lo que sale del bolsillo por cada entrega. */
    costoUnitarioBase: number;
    /** PVP menos ese costo. La pieza que multiplica todo lo demás. */
    margenBrutoUnit: number;
    pctMargenBrutoUnit: number;
    pctCostoSobrePvp: number;
    pctFleteSobrePvp: number;
    /** Precio al que el margen bruto sería del 50%. */
    precioMinimo50: number;
    /** Precio al que sería del 60%: el que deja aire para escalar. */
    precioOptimo60: number;
    /** El óptimo llevado a una cifra que se puede escribir en un anuncio. */
    precioDePublicacion: number;
    /** La escalera x1 · x2 · x3, la oferta con la que de verdad se vende. */
    escalera: TramoDePrecio[];
  };

  dia: {
    pctTotalPerdida: number;
    pedidosCancelados: number;
    despachados: number;
    devueltos: number;
    entregados: number;
    ingresoTotal: number;
    ingresoDespachado: number;
    ingresoEntregado: number;
    perdidaPorCancelacion: number;
    perdidaPorDevolucion: number;
    costoFletesDevueltos: number;
    costoMercanciaPerdida: number;
    costosOperativos: number;
    /** Entregados × margen unitario. */
    margenBrutoEntregados: number;
    /** Lo anterior menos devoluciones y extensiones. Manda en todo lo demás. */
    margenBrutoReal: number;
  };

  pauta: {
    /** El techo de gasto: `pctPauta` del margen real. */
    presupuesto: number;
    /** Presupuesto ÷ pedidos generados. El que se teclea en Meta. */
    cpaMaximoPorPedido: number;
    /** Presupuesto ÷ entregados. El que va al costo unitario. */
    cpaPorEntregado: number;
    /** CPA al que la utilidad del día llega a cero. */
    cpaEquilibrio: number;
    /** Lo que se paga por pedidos que nunca se cobran. */
    pautaQuemadaSinEntrega: number;
    utilidadOperacional: number;
    /** Lo que de verdad se gasta hoy: CPA real × pedidos. */
    pautaReal: number;
    pctMargenConsumidoPautaReal: number;
    utilidadConPautaReal: number;
  };

  unitario: {
    /** Producto + flete + publicidad por entregado. */
    costoTotal: number;
    /** PVP menos ese costo. NO es constante: lleva el CPA dentro. */
    utilidadPorProducto: number;
    margenUtilidad: number;
    /**
     * La misma utilidad del día por el otro camino.
     *
     * Tiene que dar idéntico a `pauta.utilidadOperacional`. Es la prueba
     * automática del modelo, y por eso se calcula y se expone en vez de dar por
     * hecho que las dos fórmulas dicen lo mismo.
     */
    utilidadDiaControlCruzado: number;
  };

  mes: {
    pedidos: number;
    despachados: number;
    devueltos: number;
    entregados: number;
    ingresoTotal: number;
    ingresoDespachado: number;
    ingresoEntregado: number;
    fletesDevueltos: number;
    inversionFletes: number;
    margenBruto: number;
    /** La única base válida de toda la pauta del mes. */
    margenBrutoReal: number;
    escenarios: EscenarioPauta[];
    pautaReal: number;
    pctPautaReal: number;
    utilidadConPautaReal: number;
    /** Lo anterior menos los gastos fijos. */
    utilidadNeta: number;
  };

  equilibrio: {
    /** Precio al que, con el CPA de hoy, se deja de ganar. */
    pvpEquilibrioCpaReal: number;
    /** Entregas necesarias para no perder, con el gasto de hoy. */
    entregadosEquilibrio: number;
    tasaEntregaEquilibrio: number;
    /** Puntos de holgura entre lo que entrega y lo que necesita entregar. */
    holguraEntrega: number;
  };

  caja: {
    /** Lo que sale del bolsillo cada día: pauta, mercancía y fletes. */
    desembolsoDiario: number;
    /** Ese desembolso por los días que tarda el recaudo en llegar. */
    capitalTrabajoRequerido: number;
  };
};

/** Los tres escenarios de pauta. El 35 es la regla; los otros dos, techos. */
export const PORCENTAJES_PAUTA = [35, 40, 50] as const;

/* -------------------------------- El cálculo ------------------------------ */

const pct = (v: number) => Math.min(Math.max(v, 0), 100) / 100;
const positivo = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
/** Divide sin devolver `Infinity`: con cero pedidos la pantalla enseña cero. */
const entre = (a: number, b: number) => (b > 0 ? a / b : 0);

/**
 * Lleva un precio a la cifra que de verdad se escribe en un anuncio.
 *
 * Nadie publica "$37,50". Se sube al siguiente múltiplo de cinco dólares y se
 * le quitan diez centavos: 37,50 → 39,90. Siempre HACIA ARRIBA, nunca hacia
 * abajo, porque redondear a la baja rompería la regla de margen que se acaba de
 * calcular, que es justo lo contrario de para lo que sirve esto.
 *
 * El `+0.10` de dentro es lo que lo hace estable: sin él, un precio que ya
 * termina en 90 bajaría diez centavos cada vez que se recalculara, y un precio
 * exacto de $40 acabaría en $39,90 —por debajo del mínimo.
 */
function cifraComercial(precio: number): number {
  if (!Number.isFinite(precio) || precio <= 0) return 0;
  const PASO = 5;
  return Math.ceil((precio + 0.1) / PASO) * PASO - 0.1;
}

/**
 * La escalera x1 · x2 · x3.
 *
 * Casi ningún anuncio de contraentrega lleva un precio suelto: lleva la
 * escalera, y la escalera es el argumento de venta. Multiplicar por dos no es
 * una oferta y nadie compra dos.
 *
 * Lo que permite que el pack cueste menos por unidad NO es regalar margen: es
 * que **un pack paga UN flete**. Dos unidades en la misma caja cuestan
 * `2 × producto + 1 × flete`, no dos veces el costo unitario. Por eso los tres
 * tramos se precian con la MISMA regla del 60% y aun así la escalera baja sola,
 * con el margen intacto en los tres. Un descuento que sale de una cuenta y no
 * de una promoción inventada es el que se puede sostener el mes que viene.
 */
function escaleraDePrecios(
  costoProducto: number,
  flete: number,
  precioUnitario: number,
): TramoDePrecio[] {
  return [1, 2, 3].map((unidades) => {
    const costo = costoProducto * unidades + flete;
    const precio = unidades === 1 ? precioUnitario : cifraComercial(costo / 0.4);

    const sueltas = precioUnitario * unidades;
    const ahorro = Math.max(0, sueltas - precio);
    const margen = precio - costo;

    return {
      unidades,
      precio,
      costo,
      margen,
      pctMargen: entre(margen, precio) * 100,
      ahorro,
      pctAhorro: entre(ahorro, sueltas) * 100,
    };
  });
}

export function calcularCosteo(entrada: EntradaCosteo): ResultadoCosteo {
  const pvp = positivo(entrada.pvp);
  const costoProducto = positivo(entrada.costoProducto);
  const flete = positivo(entrada.fletePromedio);
  const pedidos = positivo(entrada.pedidosDia);
  const diasMes = Math.max(1, entrada.diasMes || 30);

  const cancelacion = pct(entrada.pctCancelacion);
  const devolucion = pct(entrada.pctDevolucion);
  // El tope al 100% no es cosmético: sin él, 60+60 daría entregados negativos y
  // toda la pantalla saldría con el signo cambiado.
  const perdidaTotal = Math.min(1, cancelacion + devolucion);

  /* ----------------------------- El producto ---------------------------- */

  const costoUnitarioBase = costoProducto + flete;
  const margenBrutoUnit = pvp - costoUnitarioBase;

  // Regla del 40%: costo al 40% del precio deja un margen bruto del 60%.
  const precioOptimo60 = costoUnitarioBase / 0.4;
  const precioDePublicacion = cifraComercial(precioOptimo60);

  const producto = {
    costoUnitarioBase,
    margenBrutoUnit,
    pctMargenBrutoUnit: entre(margenBrutoUnit, pvp) * 100,
    pctCostoSobrePvp: entre(costoProducto, pvp) * 100,
    pctFleteSobrePvp: entre(flete, pvp) * 100,
    // Regla del 50%: el costo no puede pasar de la mitad del precio.
    precioMinimo50: costoUnitarioBase / 0.5,
    precioOptimo60,
    precioDePublicacion,
    escalera: escaleraDePrecios(costoProducto, flete, precioDePublicacion),
  };

  /* ------------------------------- El día ------------------------------- */

  const pedidosCancelados = pedidos * cancelacion;
  const despachados = pedidos * (1 - cancelacion);
  const devueltos = pedidos * devolucion;
  const entregados = pedidos * (1 - perdidaTotal);

  const ingresoTotal = pedidos * pvp;
  const ingresoDespachado = ingresoTotal * (1 - cancelacion);
  const ingresoEntregado = ingresoTotal * (1 - perdidaTotal);

  const costoFletesDevueltos =
    devueltos * (flete + positivo(entrada.fleteRetornoDevolucion));

  const costoMercanciaPerdida =
    devueltos * costoProducto * (1 - pct(entrada.pctRecuperacionMercancia));

  const costosOperativos =
    entregados * pvp * pct(entrada.pctComisionRecaudo) +
    despachados * positivo(entrada.costoEmpaquePorDespacho) +
    pedidos * positivo(entrada.costoConfirmacionPorPedido);

  const margenBrutoEntregados = entregados * margenBrutoUnit;
  const margenBrutoReal =
    margenBrutoEntregados - costoFletesDevueltos - costoMercanciaPerdida - costosOperativos;

  const dia = {
    pctTotalPerdida: perdidaTotal * 100,
    pedidosCancelados,
    despachados,
    devueltos,
    entregados,
    ingresoTotal,
    ingresoDespachado,
    ingresoEntregado,
    perdidaPorCancelacion: ingresoTotal - ingresoDespachado,
    perdidaPorDevolucion: ingresoDespachado - ingresoEntregado,
    costoFletesDevueltos,
    costoMercanciaPerdida,
    costosOperativos,
    margenBrutoEntregados,
    margenBrutoReal,
  };

  /* ------------------------------ La pauta ------------------------------ */

  const presupuesto = margenBrutoReal * pct(entrada.pctPauta);
  const cpaPorEntregado = entre(presupuesto, entregados);
  const cpaMaximoPorPedido = entre(presupuesto, pedidos);
  const pautaReal = positivo(entrada.cpaActual) * pedidos;

  const pauta = {
    presupuesto,
    cpaMaximoPorPedido,
    cpaPorEntregado,
    // El número que se necesita a las ocho de la noche: hasta dónde puede subir
    // el CPA antes de perder.
    cpaEquilibrio: entre(margenBrutoReal, pedidos),
    pautaQuemadaSinEntrega: (pedidosCancelados + devueltos) * cpaMaximoPorPedido,
    utilidadOperacional: margenBrutoReal - presupuesto,
    pautaReal,
    pctMargenConsumidoPautaReal: entre(pautaReal, margenBrutoReal) * 100,
    utilidadConPautaReal: margenBrutoReal - pautaReal,
  };

  /* --------------------------- El costo unitario ------------------------ */

  // Las extensiones se reparten entre lo entregado igual que la publicidad. Sin
  // esto el control cruzado de abajo dejaría de cuadrar en cuanto alguien
  // encendiera la comisión de recaudo, y la única prueba del modelo se
  // convertiría en un falso positivo.
  const extrasPorEntregado = entre(costoMercanciaPerdida + costosOperativos, entregados);
  const costoTotal = costoProducto + flete + cpaPorEntregado + extrasPorEntregado;
  const utilidadPorProducto = pvp - costoTotal;

  const unitario = {
    costoTotal,
    utilidadPorProducto,
    margenUtilidad: entre(utilidadPorProducto, pvp) * 100,
    utilidadDiaControlCruzado: entregados * utilidadPorProducto - costoFletesDevueltos,
  };

  /* -------------------------------- El mes ------------------------------ */

  const pedidosMes = pedidos * diasMes;
  const despachadosMes = pedidosMes * (1 - cancelacion);
  const devueltosMes = pedidosMes * devolucion;
  const entregadosMes = pedidosMes * (1 - perdidaTotal);

  const ingresoTotalMes = pedidosMes * pvp;
  const fletesDevueltosMes =
    devueltosMes * (flete + positivo(entrada.fleteRetornoDevolucion));
  const margenBrutoMes = entregadosMes * margenBrutoUnit;
  const margenBrutoRealMes = margenBrutoReal * diasMes;
  const pautaRealMes = pautaReal * diasMes;
  const utilidadConPautaRealMes = margenBrutoRealMes - pautaRealMes;

  const mes = {
    pedidos: pedidosMes,
    despachados: despachadosMes,
    devueltos: devueltosMes,
    entregados: entregadosMes,
    ingresoTotal: ingresoTotalMes,
    ingresoDespachado: ingresoTotalMes * (1 - cancelacion),
    ingresoEntregado: entregadosMes * pvp,
    fletesDevueltos: fletesDevueltosMes,
    inversionFletes:
      despachadosMes * flete + devueltosMes * positivo(entrada.fleteRetornoDevolucion),
    margenBruto: margenBrutoMes,
    margenBrutoReal: margenBrutoRealMes,
    escenarios: PORCENTAJES_PAUTA.map((p) => {
      const presupuestoMes = margenBrutoRealMes * (p / 100);
      return {
        pct: p,
        presupuesto: presupuestoMes,
        cpaMaximo: entre(presupuestoMes, pedidosMes),
        utilidadOperacional: margenBrutoRealMes - presupuestoMes,
        recomendado: p === 35,
      };
    }),
    pautaReal: pautaRealMes,
    pctPautaReal: entre(pautaRealMes, margenBrutoRealMes) * 100,
    utilidadConPautaReal: utilidadConPautaRealMes,
    utilidadNeta: utilidadConPautaRealMes - positivo(entrada.gastosFijosMes),
  };

  /* ----------------------------- El equilibrio -------------------------- */

  const fleteIdaYVuelta = flete + positivo(entrada.fleteRetornoDevolucion);
  // Cada entrega que se cae cuesta el margen que no se cobra MÁS el flete que
  // se paga igual; por eso el denominador suma los dos.
  const entregadosEquilibrio = entre(
    pautaReal + despachados * fleteIdaYVuelta,
    margenBrutoUnit + fleteIdaYVuelta,
  );
  const tasaEntregaEquilibrio = entre(entregadosEquilibrio, pedidos) * 100;

  const equilibrio = {
    pvpEquilibrioCpaReal:
      costoProducto +
      flete +
      entre(
        pautaReal + costoFletesDevueltos + costoMercanciaPerdida + costosOperativos,
        entregados,
      ),
    entregadosEquilibrio,
    tasaEntregaEquilibrio,
    holguraEntrega: (1 - perdidaTotal) * 100 - tasaEntregaEquilibrio,
  };

  /* -------------------------------- La caja ----------------------------- */

  // En contraentrega casi nadie quiebra por margen: quiebra por caja. La pauta
  // se paga hoy, la mercancía se pagó antes y el recaudo llega en dos semanas.
  const desembolsoDiario =
    pautaReal +
    despachados * (costoProducto + flete) +
    devueltos * positivo(entrada.fleteRetornoDevolucion);

  const caja = {
    desembolsoDiario,
    capitalTrabajoRequerido: desembolsoDiario * Math.max(0, entrada.diasCartera),
  };

  return { producto, dia, pauta, unitario, mes, equilibrio, caja };
}

/* ------------------------------ Lo que no cuadra -------------------------- */

export type AvisoCosteo = {
  campo: keyof EntradaCosteo | null;
  texto: string;
  /** `bloqueante` impide fiarse del resultado; `aviso` solo advierte. */
  nivel: "bloqueante" | "aviso";
};

const USD = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const moneda = (v: number) => USD.format(v);

/**
 * Lo que hay que decir ANTES de que alguien decida con estos números.
 *
 * Las calculadoras de internet no validan nada: aceptan un PVP por debajo del
 * costo o un 60% de cancelación con un 60% de devolución, y devuelven cifras
 * con el signo cambiado en la pantalla con la que alguien va a decidir si sigue
 * con su producto.
 */
export function avisosDeCosteo(e: EntradaCosteo, r: ResultadoCosteo): AvisoCosteo[] {
  const avisos: AvisoCosteo[] = [];

  if (e.pctCancelacion + e.pctDevolucion >= 100) {
    avisos.push({
      campo: "pctDevolucion",
      nivel: "bloqueante",
      texto:
        "Cancelación y devolución suman 100% o más: no queda nada por entregar. " +
        "Las dos van sobre los pedidos que entran, no una sobre la otra.",
    });
  }

  if (r.producto.margenBrutoUnit <= 0) {
    avisos.push({
      campo: "pvp",
      nivel: "bloqueante",
      texto: `Vendés en ${moneda(e.pvp)} y entre producto y flete te cuesta ${moneda(
        r.producto.costoUnitarioBase,
      )}. Perdés plata en cada entrega, sin contar la pauta.`,
    });
  }

  if (r.pauta.utilidadConPautaReal <= 0 && e.cpaActual > 0) {
    avisos.push({
      campo: "cpaActual",
      nivel: "aviso",
      texto: `Con un CPA de ${moneda(e.cpaActual)} el día cierra en ${moneda(
        r.pauta.utilidadConPautaReal,
      )}. Tu punto de equilibrio está en ${moneda(r.pauta.cpaEquilibrio)} por pedido.`,
    });
  }

  // Ganar hoy con una holgura de entrega de dos puntos no es ganar: es no haber
  // tenido un mal día todavía.
  if (r.pauta.utilidadConPautaReal > 0 && r.equilibrio.holguraEntrega < 5) {
    avisos.push({
      campo: "pctCancelacion",
      nivel: "aviso",
      texto: `Estás entregando ${(100 - r.dia.pctTotalPerdida).toFixed(0)}% y necesitás entregar ${r.equilibrio.tasaEntregaEquilibrio.toFixed(
        0,
      )}% para no perder. Con esa holgura, una semana mala te deja en rojo.`,
    });
  }

  return avisos;
}
