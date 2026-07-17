import { db } from "@/lib/db";
import { clientForAccount } from "./client";

// Ejecuta una PendingAction ya aprobada por el usuario. Jarvis nunca
// llama esto directamente sobre una acción PENDING — solo después de
// que alguien la aprueba desde el panel (decisión del 16 jul: siempre
// con confirmación, nunca autónomo).
export async function executeApprovedAction(actionId: string) {
  const action = await db.pendingAction.findUniqueOrThrow({
    where: { id: actionId },
    include: { campaign: { include: { adAccount: true } } },
  });

  if (action.status !== "APPROVED") {
    throw new Error(`La acción está en estado ${action.status}, no se puede ejecutar.`);
  }

  const client = clientForAccount(action.campaign.adAccount);
  const payload = JSON.parse(action.payload) as { dailyBudget?: number };

  try {
    switch (action.type) {
      case "PAUSE_CAMPAIGN":
        await client.pauseCampaign(action.campaign.externalId);
        break;
      case "RESUME_CAMPAIGN":
        await client.resumeCampaign(action.campaign.externalId);
        break;
      case "SCALE_BUDGET":
        if (typeof payload.dailyBudget !== "number") {
          throw new Error("Falta dailyBudget en el payload de la acción.");
        }
        await client.setDailyBudget(action.campaign.externalId, payload.dailyBudget);
        break;
    }

    await db.pendingAction.update({
      where: { id: action.id },
      data: { status: "EXECUTED", resolvedAt: new Date() },
    });
  } catch (err) {
    await db.pendingAction.update({
      where: { id: action.id },
      data: { status: "FAILED", resolvedAt: new Date() },
    });
    throw err;
  }
}
