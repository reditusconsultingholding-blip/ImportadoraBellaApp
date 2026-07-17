import type { AdAccount } from "@/generated/prisma/client";
import type { AdPlatformClient } from "./types";
import { createMetaClient } from "./meta";
import { createTikTokClient } from "./tiktok";

export function clientForAccount(account: AdAccount): AdPlatformClient {
  if (!account.accessToken) {
    throw new Error(
      `La cuenta "${account.name}" todavía no tiene un token conectado. Falta completar el acceso.`
    );
  }
  if (account.platform === "META") return createMetaClient(account.accessToken);
  return createTikTokClient(account.accessToken, account.externalId);
}
