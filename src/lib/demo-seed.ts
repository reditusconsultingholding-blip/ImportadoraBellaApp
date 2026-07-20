import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";

// DDL calcado de prisma/migrations/20260716210729_init/migration.sql —
// se aplica a mano porque en modo demo (SQLite en memoria) no hay
// forma de correr `prisma migrate deploy` contra el archivo :memory:.
const MIGRATION_STATEMENTS = [
  `CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessToken" TEXT,
    "connectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpaTarget" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adAccountId" TEXT NOT NULL,
    "productId" TEXT,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Campaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spend" REAL NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "purchases" INTEGER NOT NULL,
    "revenue" REAL NOT NULL,
    CONSTRAINT "MetricSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "PendingAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedById" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "PendingAction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PendingAction_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`,
  `CREATE UNIQUE INDEX "AdAccount_organizationId_platform_externalId_key" ON "AdAccount"("organizationId", "platform", "externalId")`,
  `CREATE UNIQUE INDEX "Product_organizationId_code_key" ON "Product"("organizationId", "code")`,
  `CREATE UNIQUE INDEX "Campaign_adAccountId_externalId_key" ON "Campaign"("adAccountId", "externalId")`,
  `CREATE INDEX "MetricSnapshot_campaignId_capturedAt_idx" ON "MetricSnapshot"("campaignId", "capturedAt")`,
];

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

export async function seedDemoDatabase(db: PrismaClient) {
  for (const statement of MIGRATION_STATEMENTS) {
    await db.$executeRawUnsafe(statement);
  }

  const org = await db.organization.create({ data: { name: "Importadora Bella" } });

  const passwordHash = await bcrypt.hash("jarvis-demo", 10);
  await db.user.create({
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
      name: "Importadora Bella — Meta",
      connectedAt: null,
    },
  });

  const tiktokAccount = await db.adAccount.create({
    data: {
      organizationId: org.id,
      platform: "TIKTOK",
      externalId: "70000000000000000",
      name: "Importadora Bella — TikTok",
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
}
