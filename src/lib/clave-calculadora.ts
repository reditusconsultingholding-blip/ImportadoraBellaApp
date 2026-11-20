// AJUSTES POR MES EN LA CALCULADORA (Emilia, video del 20-nov): «la devolución
// no siempre va a ser la misma en cada mes… que si yo cambio aquí, que
// solamente sea el mes de noviembre, tanto en control publicitario como en
// calculadora».
//
// Se guardan en la misma tabla que siempre, con el mes en la clave:
// «BODY @ 2026-11». Sin mes es el histórico, que vale para cualquier mes que no
// tenga lo suyo. Sin base de datos a propósito: lo usan la pantalla y el
// servidor.

const CLAVE_MES = /^(.*) @ (\d{4}-\d{2})$/;

/** La clave de un ajuste de la Calculadora para un producto en un mes. */
export function claveDelMes(producto: string, mes: string): string {
  return `${producto.trim()} @ ${mes}`;
}

/** El producto y el mes de una clave. Sin mes, `mes` es null (el histórico). */
export function separarClave(clave: string): { producto: string; mes: string | null } {
  const m = CLAVE_MES.exec(clave.trim());
  return m ? { producto: m[1], mes: m[2] } : { producto: clave.trim(), mes: null };
}

const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «noviembre 2026» para "2026-11". */
export function etiquetaDelMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMBRE_MES[(m ?? 1) - 1] ?? mes} ${a}`;
}

/** Los últimos `n` meses hasta `hoy` inclusive, del más reciente al más viejo. */
export function mesesRecientes(hoy: Date, n = 6): string[] {
  const salida: string[] = [];
  let a = hoy.getUTCFullYear();
  let m = hoy.getUTCMonth();
  for (let i = 0; i < n; i++) {
    salida.push(`${a}-${String(m + 1).padStart(2, "0")}`);
    m -= 1;
    if (m < 0) {
      m = 11;
      a -= 1;
    }
  }
  return salida;
}
