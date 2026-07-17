import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const db = new PrismaClient({ adapter });

type SeedCampaign = {
  productCode: string;
  externalId: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
};

async function main() {
  await db.pendingAction.deleteMany();
  await db.metricSnapshot.deleteMany();
  await db.campaign.deleteMany();
  await db.product.deleteMany();
  await db.adAccount.deleteMany();
  await db.user.deleteMany();
  await db.organization.deleteMany();

  const org = await db.organization.create({
    data: { name: "Fabrizio Aguilar Muñoz" },
  });

  const passwordHash = await bcrypt.hash("jarvis-demo", 10);
  const user = await db.user.create({
    data: {
      email: "demo@jarvis.local",
      passwordHash,
      name: "Fabrizio",
      role: "OWNER",
      organizationId: org.id,
    },
  });

  const products = await Promise.all(
    [
      { code: "BAT-001", name: "Kit de Batana", cpaTarget: 15 },
      { code: "TAB-001", name: "Tabla de Picar", cpaTarget: 18 },
      { code: "FAJ-001", name: "Faja Moldeadora", cpaTarget: 14 },
      { code: "BOD-001", name: "Body Reductor", cpaTarget: 16 },
      { code: "CEP-001", name: "Cepillo Desenredante", cpaTarget: 12 },
    ].map((p) => db.product.create({ data: { ...p, organizationId: org.id } }))
  );
  const productByCode = Object.fromEntries(products.map((p) => [p.code, p]));

  const metaAccount = await db.adAccount.create({
    data: {
      organizationId: org.id,
      platform: "META",
      externalId: "act_00000000000000000",
      name: "Fabrizio Ads — Meta",
      connectedAt: null, // se llena cuando conectemos la cuenta real
    },
  });

  const tiktokAccount = await db.adAccount.create({
    data: {
      organizationId: org.id,
      platform: "TIKTOK",
      externalId: "70000000000000000",
      name: "Fabrizio Ads — TikTok",
      connectedAt: null,
    },
  });

  const metaCampaigns: SeedCampaign[] = [
    { productCode: "BAT-001", externalId: "m-101", name: "BAT-001 | Kit Batana | Conversiones CO", spend: 450, impressions: 62000, clicks: 1400, purchases: 38, revenue: 1900 },
    { productCode: "TAB-001", externalId: "m-102", name: "TAB-001 | Tabla de Picar | Conversiones CO", spend: 320, impressions: 41000, clicks: 780, purchases: 9, revenue: 450 },
    { productCode: "FAJ-001", externalId: "m-103", name: "FAJ-001 | Faja Moldeadora | Conversiones CO+EC", spend: 610, impressions: 88000, clicks: 2100, purchases: 52, revenue: 3120 },
    { productCode: "BOD-001", externalId: "m-104", name: "BOD-001 | Body Reductor | Conversiones EC", spend: 280, impressions: 35000, clicks: 640, purchases: 14, revenue: 980 },
    { productCode: "CEP-001", externalId: "m-105", name: "CEP-001 | Cepillo Desenredante | Conversiones CO", spend: 190, impressions: 29000, clicks: 610, purchases: 21, revenue: 840 },
  ];

  const tiktokCampaigns: SeedCampaign[] = [
    { productCode: "BAT-001", externalId: "t-201", name: "BAT-001 | Kit Batana | Spark Ads CO", spend: 210, impressions: 54000, clicks: 1100, purchases: 19, revenue: 950 },
    { productCode: "FAJ-001", externalId: "t-202", name: "FAJ-001 | Faja Moldeadora | Spark Ads EC", spend: 340, impressions: 47000, clicks: 900, purchases: 11, revenue: 660 },
    { productCode: "CEP-001", externalId: "t-203", name: "CEP-001 | Cepillo Desenredante | Spark Ads CO", spend: 95, impressions: 21000, clicks: 480, purchases: 12, revenue: 480 },
  ];

  for (const [account, list] of [
    [metaAccount, metaCampaigns],
    [tiktokAccount, tiktokCampaigns],
  ] as const) {
    for (const c of list) {
      const campaign = await db.campaign.create({
        data: {
          adAccountId: account.id,
          productId: productByCode[c.productCode].id,
          externalId: c.externalId,
          name: c.name,
          status: "ACTIVE",
        },
      });
      await db.metricSnapshot.create({
        data: {
          campaignId: campaign.id,
          spend: c.spend,
          impressions: c.impressions,
          clicks: c.clicks,
          purchases: c.purchases,
          revenue: c.revenue,
        },
      });
    }
  }

  console.log("Seed listo.");
  console.log(`Login demo -> ${user.email} / jarvis-demo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
