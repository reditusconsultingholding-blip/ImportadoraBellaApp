import { NextResponse } from "next/server";
import { z } from "zod";

// Lectura validada del cuerpo de un pedido.
//
// Antes cada ruta hacía `(await req.json()) as {...}`: el `as` le promete a
// TypeScript una forma que nadie verificó. Un cuerpo que no es JSON tiraba un
// 500, un campo con el tipo equivocado llegaba hasta la base, y un campo de
// más (por ejemplo `role`) solo quedaba afuera si la ruta se acordaba de no
// pasarlo. Con un esquema:
//
// - JSON inválido → 400 con un mensaje claro, no un 500.
// - Tipos y largos se verifican antes de tocar nada.
// - Los campos que el esquema no nombra se descartan (z.object quita lo que
//   sobra), así que no hay asignación masiva posible.

export type Lectura<T> = { ok: true; datos: T } | { ok: false; respuesta: NextResponse };

export async function leerCuerpo<S extends z.ZodType>(req: Request, esquema: S): Promise<Lectura<z.infer<S>>> {
  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return { ok: false, respuesta: NextResponse.json({ error: "El cuerpo del pedido no es JSON válido." }, { status: 400 }) };
  }
  const r = esquema.safeParse(crudo);
  if (!r.success) {
    const primero = r.error.issues[0];
    const campo = primero?.path.join(".") || "pedido";
    return {
      ok: false,
      respuesta: NextResponse.json({ error: `Dato inválido en «${campo}»: ${primero?.message ?? "revisar"}` }, { status: 400 }),
    };
  }
  return { ok: true, datos: r.data };
}

// Piezas que se repiten entre rutas.
export const correo = z.string().trim().toLowerCase().email("no es un correo válido").max(254);
export const clave = z.string().min(8, "tiene que tener al menos 8 caracteres").max(200);
export const texto = (max: number) => z.string().trim().max(max);
export const rol = z.enum(["OWNER", "DIRECTOR", "EDITOR", "PENDING"]);
