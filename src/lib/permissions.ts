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
