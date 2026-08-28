import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";

// Quiénes compran y cómo.
//
// Un cliente se identifica por su teléfono: en contraentrega es el dato que
// siempre está y el que nunca se repite entre personas distintas. El correo
// falta en la mitad de las órdenes y el nombre se escribe de diez formas.

export type Cliente = {
  telefono: string;
  nombre: string | null;
  email: string | null;
  provincia: string | null;
  ciudad: string | null;
  pedidos: number;
  total: number;
  primera: Date;
  ultima: Date;
  productos: string[];
};

export type PatronesClientes = {
  clientes: Cliente[];
  totales: {
    clientes: number;
    ordenes: number;
    facturado: number;
    /** Cuántos compraron más de una vez. */
    repiten: number;
    /** Qué porción de la facturación viene de quienes repiten. */
    porcionRepiten: number;
    /** Órdenes sin teléfono: no se pueden atribuir a nadie. */
    sinTelefono: number;
  };
  porProvincia: { provincia: string; pedidos: number; total: number }[];
  /** Qué se compra junto con qué. */
  combinaciones: { a: string; b: string; veces: number }[];
};

/** Los teléfonos vienen escritos de mil formas; se comparan solo por dígitos. */
function normalizarTelefono(t: string | null) {
  if (!t) return null;
  const soloDigitos = t.replace(/\D/g, "");
  if (soloDigitos.length < 7) return null;
  // Se guardan los últimos nueve: el prefijo de país aparece a veces sí y a
  // veces no, y sin recortarlo el mismo cliente cuenta como dos.
  return soloDigitos.slice(-9);
}

export async function getPatronesClientes(
  organizationId: string,
  range: Range,
  limite = 500
): Promise<PatronesClientes> {
  const ordenes = await db.shopifyOrder.findMany({
    where: {
      store: { organizationId },
      occurredAt: { gte: range.fromInstant, lte: range.toInstant },
    },
    select: {
      occurredAt: true,
      netSales: true,
      clienteNombre: true,
      clienteTelefono: true,
      clienteEmail: true,
      provincia: true,
      ciudad: true,
      lineItems: { select: { productName: true } },
    },
  });

  const porCliente = new Map<string, Cliente>();
  const porProvincia = new Map<string, { pedidos: number; total: number }>();
  const juntos = new Map<string, number>();
  let sinTelefono = 0;

  for (const o of ordenes) {
    const provincia = o.provincia?.trim() || "Sin provincia";
    const p = porProvincia.get(provincia) ?? { pedidos: 0, total: 0 };
    p.pedidos += 1;
    p.total += o.netSales;
    porProvincia.set(provincia, p);

    // Qué se lleva junto con qué, dentro de una misma orden.
    const nombres = [...new Set(o.lineItems.map((l) => l.productName))].sort();
    for (let i = 0; i < nombres.length; i++) {
      for (let j = i + 1; j < nombres.length; j++) {
        const clave = `${nombres[i]}||${nombres[j]}`;
        juntos.set(clave, (juntos.get(clave) ?? 0) + 1);
      }
    }

    const tel = normalizarTelefono(o.clienteTelefono);
    if (!tel) {
      sinTelefono += 1;
      continue;
    }

    const c = porCliente.get(tel) ?? {
      telefono: tel,
      nombre: o.clienteNombre,
      email: o.clienteEmail,
      provincia: o.provincia,
      ciudad: o.ciudad,
      pedidos: 0,
      total: 0,
      primera: o.occurredAt,
      ultima: o.occurredAt,
      productos: [],
    };
    c.pedidos += 1;
    c.total += o.netSales;
    if (o.occurredAt < c.primera) c.primera = o.occurredAt;
    if (o.occurredAt > c.ultima) {
      c.ultima = o.occurredAt;
      // Los datos más recientes ganan: la gente se muda y cambia de nombre en
      // el formulario.
      c.nombre = o.clienteNombre ?? c.nombre;
      c.provincia = o.provincia ?? c.provincia;
      c.ciudad = o.ciudad ?? c.ciudad;
    }
    for (const l of o.lineItems) {
      if (!c.productos.includes(l.productName)) c.productos.push(l.productName);
    }
    porCliente.set(tel, c);
  }

  const clientes = [...porCliente.values()].sort((a, b) => b.total - a.total);
  const repiten = clientes.filter((c) => c.pedidos > 1);
  const facturado = ordenes.reduce((s, o) => s + o.netSales, 0);

  return {
    clientes: clientes.slice(0, limite),
    totales: {
      clientes: clientes.length,
      ordenes: ordenes.length,
      facturado,
      repiten: repiten.length,
      porcionRepiten:
        facturado > 0 ? repiten.reduce((s, c) => s + c.total, 0) / facturado : 0,
      sinTelefono,
    },
    porProvincia: [...porProvincia.entries()]
      .map(([provincia, v]) => ({ provincia, ...v }))
      .sort((a, b) => b.total - a.total),
    combinaciones: [...juntos.entries()]
      .map(([clave, veces]) => {
        const [a, b] = clave.split("||");
        return { a, b, veces };
      })
      .filter((c) => c.veces >= 3)
      .sort((a, b) => b.veces - a.veces)
      .slice(0, 20),
  };
}
