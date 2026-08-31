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
