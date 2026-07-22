import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const PLATFORM_LABEL: Record<string, string> = {
  META: "Meta",
  TIKTOK: "TikTok",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { platform } = (await req.json()) as { platform?: string };
  if (platform !== "META" && platform !== "TIKTOK") {
    return NextResponse.json({ error: "Plataforma inválida." }, { status: 400 });
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  const countSamePlatform = await db.adAccount.count({
    where: { organizationId: session.organizationId, platform },
  });

  const account = await db.adAccount.create({
    data: {
      organizationId: session.organizationId,
      platform,
      // Placeholder único hasta que se pegue el ID real de la cuenta —
      // se reemplaza en /api/accounts/[id]/connect.
      externalId: `pending-${platform.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${org.name} — ${PLATFORM_LABEL[platform]} #${countSamePlatform + 1}`,
    },
  });

  return NextResponse.json({ account });
}
