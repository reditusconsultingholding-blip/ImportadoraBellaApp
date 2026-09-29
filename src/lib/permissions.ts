import type { SessionPayload } from "@/lib/auth";

// OWNER (Super Admin) y DIRECTOR (Director Operativo Creativo) arman el
// pipeline y ven todo. EDITOR solo ve/edita lo que se le asignó. PENDING
// no entra a nada de esto todavía — recién se creó, falta que le den rol.
export function canManagePipeline(role: SessionPayload["role"]) {
  return role === "OWNER" || role === "DIRECTOR";
}

export function canAccessPipeline(role: SessionPayload["role"]) {
  return role === "OWNER" || role === "DIRECTOR" || role === "EDITOR";
}

export function canAccessRequirement(
  session: SessionPayload,
  requirement: { ownerId: string | null }
) {
  return canManagePipeline(session.role) || requirement.ownerId === session.userId;
}

/**
 * Quién da de alta gente y reparte roles.
 *
 * Era solo el dueño. Emilia —directora operativa— es quien arma el equipo y
 * quien sabe cuándo entra alguien nuevo: "tenemos que agregar a una nueva
 * compañera, ¿cómo agregaríamos?". Tener que pedirle el alta a Fabricio o a
 * Sebastián cada vez convertía un trámite de dos minutos en algo que espera
 * un día, y mientras tanto la persona nueva no puede trabajar.
 */
export function canManageUsers(role: SessionPayload["role"]) {
  return role === "OWNER" || role === "DIRECTOR";
}

/**
 * Los rangos, de más a menos. Es el orden que decide quién puede sobre quién.
 *
 * PENDING no es "menos permisos": es "todavía sin decidir". Va abajo porque no
 * abre nada, pero no es un castigo — es el estado de quien recién se creó.
 */
const RANGO: Record<string, number> = { OWNER: 3, DIRECTOR: 2, EDITOR: 1, PENDING: 0 };

/**
 * NADIE PUEDE DAR UN ROL MÁS ALTO QUE EL SUYO.
 *
 * Es la regla que evita que abrir el alta a dirección sea, en la práctica,
 * volver administrador a cualquiera: sin esto, una directora podría crearse
 * una segunda cuenta de administrador y quedarse con la facturación, las
 * conexiones y los tokens de producción. No hace falta mala intención —alcanza
 * con elegir mal en un desplegable.
 */
export function puedeOtorgarRol(quienOtorga: SessionPayload["role"], rolPedido: string) {
  const pedido = RANGO[rolPedido];
  if (pedido === undefined) return false;
  return pedido <= (RANGO[quienOtorga] ?? -1);
}

/**
 * Si alguien puede editar o dar de baja a otra persona.
 *
 * El dueño puede con todos. Dirección puede con todos MENOS con un
 * administrador: si no, bastaría con editarle el correo a un dueño para
 * quedarse con su cuenta.
 */
export function puedeEditarUsuario(
  quienEdita: SessionPayload["role"],
  rolDelOtro: string,
) {
  if (quienEdita === "OWNER") return true;
  if (!canManageUsers(quienEdita)) return false;
  return (RANGO[rolDelOtro] ?? 99) < RANGO.OWNER;
}

/**
 * Quién puede tocar las conexiones: cuentas de Meta y TikTok, y la tienda.
 *
 * Esta pantalla guarda y reemplaza los TOKENS de producción. Hasta ahora solo
 * pedía sesión iniciada, así que alguien recién registrado —sin rol asignado
 * todavía— podía entrar y cambiarlos. No hacía falta ser malintencionado:
 * bastaba con curiosear y apretar "desconectar" para dejar al negocio sin
 * datos.
 *
 * Se deja en OWNER y DIRECTOR y no solo en OWNER porque conectar una cuenta
 * publicitaria es trabajo de operación, y un dueño que viaja no puede ser el
 * cuello de botella para eso.
 */
export function canManageConexiones(role: SessionPayload["role"]) {
  return role === "OWNER" || role === "DIRECTOR";
}

/**
 * Quién puede hablar con Jarvis.
 *
 * Jarvis consulta la base entera: facturación, utilidad por producto, costos,
 * clientes. Es la pantalla que más datos expone de toda la app, y tampoco
 * miraba el rol: una cuenta recién creada podía preguntarle cuánto factura la
 * empresa antes de que nadie le diera permiso a nada.
 */
export function canUseJarvis(role: SessionPayload["role"]) {
  return canAccessPipeline(role);
}

/**
 * Quién aprueba o rechaza una propuesta.
 *
 * Aprobar dispara una acción real contra Meta o TikTok —pausar una campaña,
 * subir un presupuesto—, así que es una decisión de dirección, no algo que
 * pueda resolver cualquiera que pase por la pantalla.
 */
export function canApproveActions(role: SessionPayload["role"]) {
  return canManagePipeline(role);
}

/**
 * Quién ve el dinero: ingresos, rentabilidad, costos, la calculadora.
 *
 * No es una preferencia de pantalla, es una regla del negocio. El equipo
 * creativo trabaja con rendimiento —si una pieza funciona, si conviene
 * escalar, qué producir— y esas decisiones no necesitan saber cuánto factura
 * la empresa. Quien no lo tiene sigue viendo el pulso, el veredicto de escalar
 * y las recomendaciones; lo que no ve son las cifras.
 *
 * Va por persona y no por rol para que sumar a alguien no le abra la
 * facturación de rebote. Por defecto no lo tiene nadie.
 */
export function canViewFinancials(usuario: { canViewFinancials: boolean } | null | undefined) {
  return usuario?.canViewFinancials === true;
}
