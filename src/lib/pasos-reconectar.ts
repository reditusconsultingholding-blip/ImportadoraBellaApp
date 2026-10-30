/**
 * El paso a paso para volver a conectar una cuenta publicitaria, con el nombre
 * de la cuenta que falló metido en el texto.
 *
 * POR QUÉ ESTÁ ACÁ Y NO EN UN PDF. El instructivo existía como documento
 * suelto, con la cuenta de ese día escrita a mano. Dos problemas: hay que
 * acordarse de dónde quedó el archivo justo cuando hace falta, y queda viejo
 * en cuanto falla otra cuenta. Ahora los pasos viven en la app, los dibuja el
 * mismo aviso que reporta la caída —con el nombre y el número de la cuenta que
 * se cayó— y el PDF los importa de acá. Un solo texto: si se mejora un paso,
 * se mejora en las dos partes a la vez.
 *
 * LO QUE NO SÉ, LO DIGO. Windsor no publica los nombres exactos de sus botones
 * y les cambia la interfaz. Los pasos nombran lo que se busca —reconectar el
 * conector de Facebook, marcar las cuentas— y no prometen el rótulo literal.
 */

export type PasoReconectar = {
  titulo: string;
  cuerpo: string;
  /** Cómo se ve que salió bien. Sin esto, el paso termina en una pregunta. */
  seVeAsi?: string;
};

export type CuentaCaida = {
  nombre: string;
  /** El ad_account_id de Meta o el advertiser_id de TikTok. */
  externalId: string;
  /** El último día del que llegaron números, ya escrito en palabras. */
  ultimoDia: string;
  /** «Facebook Ads» o «TikTok Ads», como se llama el conector en Windsor. */
  conector: string;
};

export function pasosParaReconectar(c: CuentaCaida): PasoReconectar[] {
  return [
    {
      titulo: "Entra a windsor.ai con la cuenta de siempre",
      cuerpo:
        "Tiene que ser el mismo usuario con el que se conectaron las cuentas de Importadora Bella. " +
        "Si hay dos usuarios de Windsor dando vueltas, las cuentas conectadas con uno no se ven " +
        "desde el otro, y eso solo se parece a que la cuenta no existe.",
    },
    {
      titulo: "Busca la cuenta en la pestaña de datos",
      cuerpo:
        `Abre la sección donde se ven los orígenes de datos (Data / Data sources), filtra por el ` +
        `conector de ${c.conector} y busca «${c.nombre}» o su número: ${c.externalId}.`,
      seVeAsi:
        `Si la cuenta NO aparece en la lista: se desconectó y hay que volver a conectarla (paso 3). ` +
        `Si aparece pero su último dato es del ${c.ultimoDia}, es lo mismo: el permiso se cayó ` +
        `aunque la cuenta siga figurando.`,
    },
    {
      titulo: `Vuelve a conectar el conector de ${c.conector}`,
      cuerpo:
        `En el conector de ${c.conector}, usa la opción de reconectar o reautorizar. Te va a mandar ` +
        `a iniciar sesión: tiene que ser el usuario que administra esas cuentas publicitarias. ` +
        `Cuando pida permisos, acepta TODOS los que muestre.`,
    },
    {
      titulo: "Marca las cuentas, una por una",
      cuerpo:
        "Después de iniciar sesión, Windsor muestra la lista de cuentas publicitarias a las que ese " +
        "usuario tiene acceso. Marca TODAS las que se usen, no solo la que viniste a arreglar, y " +
        "guarda. Este es el paso donde se pierde: la pantalla suele venir con unas pocas marcadas y " +
        "es fácil dar por hecho que están todas. Ya pasó — el 17 de octubre se reconectaron tres " +
        "cuentas y una se volvió a caer a los tres días.",
      seVeAsi: "Al guardar, todas tienen que quedar en la lista de cuentas conectadas.",
    },
    {
      titulo: "Si una cuenta no aparece en esa lista, el problema está en Meta",
      cuerpo:
        "Significa que el usuario con el que iniciaste sesión ya no tiene acceso a esa cuenta " +
        "publicitaria. Entra al Business Manager de Meta > Configuración del negocio > Cuentas " +
        "publicitarias, busca la cuenta y revisa que ese usuario siga asignado. Con rol de " +
        "Administrador o de Anunciante alcanza; con el de solo Página, no.",
    },
    {
      titulo: "Compruébalo en Jarvis, sin esperar a mañana",
      cuerpo:
        "Entra a Conexiones, busca la tarjeta de la cuenta y aprieta «Sincronizar ahora». Lee lo " +
        "que contesta: dice si Windsor devolvió esa cuenta o si contestó bien pero sin ella.",
      seVeAsi:
        "La tarjeta tiene que pasar de «Sin datos hace N días», en rojo, a «Al día» con la fecha de " +
        "hoy, y este aviso desaparece solo en la siguiente vuelta del reloj, que es de un par de " +
        "minutos. Si el aviso sigue, es que la cuenta todavía no está entregando datos.",
    },
    {
      titulo: "Si después de todo esto sigue sin venir",
      cuerpo:
        `Escríbele al soporte de Windsor con el nombre y el número de la cuenta (${c.externalId}) y ` +
        `cuéntales que el conector de ${c.conector} devuelve las demás cuentas pero no esa, desde el ` +
        `${c.ultimoDia}. Nunca les mandes la clave de la API completa: con los últimos cuatro ` +
        `caracteres les alcanza.`,
    },
  ];
}

/** Los pasos para la otra falla: la cuenta entrega todo menos ventas. */
export function pasosParaCuentaSinCompras(nombre: string): PasoReconectar[] {
  return [
    {
      titulo: "Primero: mira cómo se llaman sus campañas",
      cuerpo:
        `Entra al administrador de anuncios de «${nombre}» y lee los nombres de las campañas que ` +
        `están gastando. Si llevan «WP», «WhatsApp» o «Mensajes», la venta se cierra en el chat y ` +
        `el píxel no tiene cómo verla: no hay nada roto. Si son campañas de ventas a la web, sí hay ` +
        `algo que arreglar.`,
    },
    {
      titulo: "Si son campañas a WhatsApp",
      cuerpo:
        "Usa el botón de acá abajo para dejarlo anotado. El aviso se calla para esta cuenta y el " +
        "panel deja de esperar compras de ella. Si algún día registra una compra por la web, la " +
        "marca se levanta sola y el aviso vuelve.",
    },
    {
      titulo: "Si son campañas a la web, revisa el píxel",
      cuerpo:
        "En el Business Manager de Meta > Administrador de eventos, busca el conjunto de datos " +
        "(píxel) que usa esa cuenta y revisa dos cosas: que reciba el evento de Compra en las " +
        "últimas horas, y que la cuenta publicitaria esté asignada a ese píxel. Una cuenta nueva " +
        "suele quedar sin el píxel asignado, y así gasta sin poder registrar una sola venta.",
      seVeAsi:
        "En el Administrador de eventos, el evento «Compra» tiene que mostrar actividad reciente y " +
        "la cuenta publicitaria tiene que estar en la lista de orígenes asignados.",
    },
  ];
}
