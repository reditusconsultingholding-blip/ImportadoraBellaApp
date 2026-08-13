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
