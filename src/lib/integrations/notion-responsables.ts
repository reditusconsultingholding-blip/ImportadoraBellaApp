import { db } from "@/lib/db";
import { buscarBasesConTitulo, queryDatabase, type NotionPropertyValue } from "@/lib/integrations/notion";
import { comparar, normalizarNombre } from "@/lib/enlace-shopify";
import {
  claveDe,
  decisionesVigentes,
  registrarChoques,
  type ChoqueDetectado,
} from "@/lib/conflictos-responsables";

// Quién lleva cada producto, leído de la base PRODUCTOS ORDEN de Notion.
//
// Es donde el equipo ya lo lleva: una fila por producto y plataforma, con su
// propietario y si está activo. Emilia lo nombró en la reunión —"¿dónde vemos
// eso? En productos orden"— y pidió que esté conectado. Así, lo que se cambia
// allá llega solo a Jarvis: quién puede cargar piezas de cada producto y a
// quién le reclama el aviso de las ocho.
//
// Solo cuentan las filas ACTIVAS. Un producto tiene como responsables a todos
// los propietarios de sus filas activas, de Meta y de TikTok juntos: Truly en
// Meta es de Antonella y en TikTok de María José y Antonella, así que Truly
// es de las dos.
//
// Los responsables que vienen de acá se marcan con origen "notion" y se
// reescriben en cada pasada. Los que dirección asignó a mano en Jarvis no se
// tocan, figure o no el producto en Notion.

const TITULO = "PRODUCTOS ORDEN";

function texto(p: NotionPropertyValue | undefined): string {
  if (!p) return "";
  const tipo = p.type as string;
  const v = p[tipo] as unknown;
  if (tipo === "title" || tipo === "rich_text") {
    return ((v as { plain_text: string }[]) ?? []).map((t) => t.plain_text).join("").trim();
  }
  if (tipo === "select" || tipo === "status") return (v as { name?: string } | null)?.name ?? "";
  if (tipo === "multi_select") return ((v as { name: string }[]) ?? []).map((t) => t.name).join(", ");
  if (tipo === "people") return ((v as { name?: string }[]) ?? []).map((t) => t.name ?? "").join(", ");
  return "";
}

export type ResultadoResponsables = {
  productos: number;
  asignaciones: number;
  /** Nombres de producto de Notion que no se pudieron cruzar con Jarvis. */
  productosSinCruzar: string[];
  /** Personas de Notion que no son usuarios de Jarvis. */
  personasSinCruzar: string[];
  /** Choques nuevos que quedaron esperando una decisión de dirección. */
  choquesNuevos: number;
};

export async function sincronizarResponsables(
  organizationId: string,
  token: string,
): Promise<ResultadoResponsables | null> {
  const bases = await buscarBasesConTitulo(token, TITULO);
  if (bases.length === 0) return null;
  const filas = await queryDatabase(token, bases[0].id);

  const [productos, usuarios] = await Promise.all([
    db.product.findMany({
      where: { organizationId, archived: false },
      select: { id: true, name: true, code: true },
    }),
    db.user.findMany({
      where: { organizationId, role: { in: ["OWNER", "DIRECTOR", "EDITOR"] } },
      select: { id: true, name: true },
    }),
  ]);

  // Una persona de Notion ("MARIA JOSÉ") es un usuario de Jarvis ("Maria Jose")
  // cuando su nombre empieza igual. Se exige que haya uno solo.
  const usuarioDe = (nombre: string) => {
    const n = normalizarNombre(nombre);
    if (!n) return null;
    const candidatos = usuarios.filter((u) => {
      const k = normalizarNombre(u.name);
      return k === n || k.startsWith(n + " ");
    });
    return candidatos.length === 1 ? candidatos[0] : null;
  };

  // El producto de Jarvis de un nombre de Notion: igual, o el más parecido si
  // gana claro. "345 RELIEF CREAM" y "CREMA 345" son el mismo, y un empate no
  // se decide solo.
  const productoDe = (nombre: string) => {
    const n = normalizarNombre(nombre);
    const exacto = productos.find((p) => normalizarNombre(p.name) === n);
    if (exacto) return exacto;
    const puntajes = productos
      .map((p) => ({ p, ...comparar(nombre, p.name) }))
      .filter((c) => c.base >= 0.5)
      .sort((a, b) => b.base - a.base || b.solape - a.solape);
    const [g, s] = puntajes;
    if (g && !(s && s.base >= g.base && g.solape - s.solape < 0.15)) return g.p;

    // Dos respaldos, y los dos exigen un único candidato:
    // - el nombre de Notion entero dentro del de Jarvis: "BOOSTER" en
    //   "BOOSTER PRO DUO";
    // - un número que comparten: "345 RELIEF CREAM" y "CREMA 345".
    const contiene = productos.filter((p) => ` ${normalizarNombre(p.name)} `.includes(` ${n} `));
    if (contiene.length === 1) return contiene[0];
    // Y pegado: "BOOSTER" es "BOOSTERPRO" en Jarvis.
    const junto = n.replace(/ /g, "");
    const pegados = productos.filter((p) => normalizarNombre(p.name).replace(/ /g, "").startsWith(junto));
    if (junto.length >= 5 && pegados.length === 1) return pegados[0];
    const numeros = n.split(" ").filter((t) => /^\d{2,}$/.test(t));
    if (numeros.length) {
      const conNumero = productos.filter((p) => {
        const k = normalizarNombre(p.name).split(" ");
        return numeros.some((x) => k.includes(x));
      });
      if (conNumero.length === 1) return conNumero[0];
    }
    return null;
  };

  const porProducto = new Map<string, Set<string>>();
  const productosSinCruzar = new Set<string>();
  const personasSinCruzar = new Set<string>();
  // Los choques, para preguntarle a dirección en vez de decidir solos.
  const choques: ChoqueDetectado[] = [];

  for (const f of filas) {
    const estado = texto(f.properties["Estado"]).toUpperCase();
    if (estado !== "ACTIVO") continue;
    const nombreProducto = texto(f.properties["PRODUCTOS"]);
    const propietarios = texto(f.properties["PROPIETARIO"]);
    if (!nombreProducto || !propietarios) continue;

    const producto = productoDe(nombreProducto);
    if (!producto) {
      productosSinCruzar.add(nombreProducto);
      continue;
    }
    const set = porProducto.get(producto.id) ?? new Set<string>();
    for (const persona of propietarios.split(",").map((x) => x.trim()).filter(Boolean)) {
      const u = usuarioDe(persona);
      if (u) set.add(u.id);
      else {
        personasSinCruzar.add(persona);
        // Un nombre de Notion que no es nadie en Jarvis. Esto arrancó todo: en
        // la planilla decía "ANITA" y en Jarvis la persona está como "Ana", así
        // que el producto se quedaba sin responsable y nadie entendía por qué.
        choques.push({ tipo: "sin_cruzar", productId: producto.id, nombreEnNotion: persona });
      }
    }
    porProducto.set(producto.id, set);
  }

  // SE REESCRIBE LO QUE VINO DE NOTION, NO TODO.
  //
  // Esto borraba TODOS los responsables de cada producto que figura en Notion,
  // incluidos los que dirección había asignado a mano. El comentario de antes
  // decía que los manuales quedaban, y era verdad a medias: quedaban los de
  // productos que Notion NO nombra. Si el producto estaba en Notion, la
  // asignación hecha en Jarvis duraba hasta la pasada siguiente.
  //
  // Emilia lo reportó así: "yo le asigno a Anita y, a pesar de que ya está como
  // responsable, no puede editar; se saca automáticamente, después de un par de
  // minutos se saca la etiqueta". No era un problema de permisos — el permiso
  // se calcula leyendo esta misma tabla, así que al desaparecer la fila
  // desaparece el acceso. Eran los dos síntomas del mismo borrado.
  //
  // Pasa con la gente nueva, que es justo cuando más molesta: Ana todavía no
  // está en PRODUCTOS ORDEN, así que Notion nunca la trae, y cada pasada la
  // borraba de los productos que sí nombra. De sus dos asignaciones sobrevivió
  // una sola, la del único producto que Notion no conoce.
  //
  // Con el filtro por origen, Notion sigue mandando sobre lo suyo y lo que
  // dirección pone a mano se queda. Si Notion trae a alguien que ya estaba a
  // mano, el skipDuplicates de abajo deja la fila manual: la decisión de la
  // persona pesa más que la planilla.
  const ids = [...porProducto.keys()];

  // LO QUE HAY A MANO Y NOTION NO TRAE: eso es un choque, no una orden.
  //
  // Antes esto se resolvía borrando, en silencio. Ahora se mira quién quedó
  // puesto a mano en un producto que Notion nombra y que Notion no le reconoce,
  // y se anota para que dirección decida. La fila NO se toca hasta que haya
  // decisión: dejar a alguien con un acceso de más se ve y se corrige, quitarlo
  // sin avisar es lo que nadie veía.
  const aMano = await db.responsableProducto.findMany({
    where: { productId: { in: ids }, origen: null },
    select: { productId: true, userId: true },
  });

  const decisiones = await decisionesVigentes(organizationId);
  const aQuitar: { productId: string; userId: string }[] = [];

  for (const fila of aMano) {
    if (porProducto.get(fila.productId)?.has(fila.userId)) continue; // Notion también lo trae.
    const choque: ChoqueDetectado = {
      tipo: "sobra_en_jarvis",
      productId: fila.productId,
      userId: fila.userId,
    };
    // Si dirección ya contestó por este mismo choque, se aplica y no se vuelve
    // a preguntar. Lo que no tiene respuesta todavía queda como está.
    const decidido = decisiones.get(claveDe(choque));
    if (decidido === "quitar") aQuitar.push(fila);
    else if (!decidido) choques.push(choque);
  }

  let asignaciones = 0;
  await db.$transaction(async (tx) => {
    await tx.responsableProducto.deleteMany({
      where: { productId: { in: ids }, origen: "notion" },
    });

    // Las bajas que dirección aprobó, una por una: son pocas y cada una es una
    // decisión tomada a mano, no un barrido.
    for (const q of aQuitar) {
      await tx.responsableProducto.deleteMany({
        where: { productId: q.productId, userId: q.userId, origen: null },
      });
    }
    const data = ids.flatMap((productId) =>
      [...porProducto.get(productId)!].map((userId) => ({ productId, userId, origen: "notion" })),
    );
    asignaciones = data.length;
    if (data.length) await tx.responsableProducto.createMany({ data, skipDuplicates: true });
  });

  // Se anotan DESPUÉS de escribir: si la transacción falla, no queda una
  // notificación hablando de un choque que nunca llegó a existir.
  const { nuevos } = await registrarChoques(organizationId, choques);

  return {
    productos: ids.length,
    asignaciones,
    productosSinCruzar: [...productosSinCruzar].sort(),
    personasSinCruzar: [...personasSinCruzar].sort(),
    choquesNuevos: nuevos,
  };
}
