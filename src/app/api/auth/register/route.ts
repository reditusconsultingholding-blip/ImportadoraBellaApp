import { NextResponse } from "next/server";

// El registro abierto está cerrado desde el 9 de septiembre de 2026.
//
// Había un código de seis dígitos —al final, el 190300 fijo— con el que
// cualquiera podía crearse una cuenta. Quien se registraba entraba con rol
// PENDING y no veía nada del negocio hasta que un administrador se lo diera,
// así que no era una puerta abierta a los datos; pero el código circulaba por
// WhatsApp y sumaba desconocidos a la lista de usuarios de un panel financiero.
//
// El flujo real es el otro, y es el que quedó: la dirección crea la cuenta
// desde Usuarios con el rol ya puesto y una clave provisoria, y la persona está
// obligada a cambiarla en su primera entrada.
//
// La ruta se conserva respondiendo 403 en lugar de borrarse. Si alguien tiene
// la pantalla vieja abierta en una pestaña o guardó el enlace, recibe una
// explicación de a quién pedirle la cuenta, en vez de un 404 que se lee como
// una aplicación rota.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Las cuentas las crea la dirección desde Usuarios. Pedile una a Fabricio o a Katherine.",
    },
    { status: 403 },
  );
}
