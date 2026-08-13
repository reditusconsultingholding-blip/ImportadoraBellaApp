import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { PROFITABILITY_ABRIL_2026, PROFITABILITY_MONTH_ABRIL } from "@/lib/profitability-data";

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
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
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
  `CREATE TABLE "ShopifyStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT,
    "connectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopifyStore_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "channel" TEXT NOT NULL,
    "grossSales" REAL NOT NULL,
    "discounts" REAL NOT NULL,
    "shipping" REAL NOT NULL,
    "taxes" REAL NOT NULL,
    "netSales" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopifyOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ShopifyStore" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "ShopifyOrderLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT,
    "quantity" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "ShopifyOrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT,
    "adName" TEXT NOT NULL,
    "externalId1" TEXT,
    "externalId2" TEXT,
    "adType" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "visualFormat" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "awarenessLevel" TEXT NOT NULL,
    "marketOrigin" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "originalVideoLink" TEXT,
    "tiktokPostLink" TEXT,
    "fbPostLink" TEXT,
    "hookRate" REAL,
    "ctr" REAL,
    "holdRate" REAL,
    "purchases" INTEGER,
    "cpa" REAL,
    "frequency" REAL,
    "cpm" REAL,
    "nextAction" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Requirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requirement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Requirement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requirementId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "type" TEXT NOT NULL DEFAULT 'mention',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "pdf" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "ProductProfitability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "orders" INTEGER NOT NULL,
    "cpa" REAL NOT NULL,
    "revenueAccum" REAL NOT NULL,
    "adSpendAccum" REAL NOT NULL,
    "operatingExpenseAccum" REAL NOT NULL,
    "adminExpenseAccum" REAL NOT NULL,
    "profitAccum" REAL NOT NULL,
    "merchandiseAccum" REAL,
    "desiredProfitPerOrder" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductProfitability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "DropiConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "integrationKey" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Ecuador',
    "connectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DropiConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isReturn" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DropiConnection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`,
  `CREATE UNIQUE INDEX "DailyReport_organizationId_date_key" ON "DailyReport"("organizationId", "date")`,
  `CREATE UNIQUE INDEX "ProductProfitability_organizationId_month_productName_key" ON "ProductProfitability"("organizationId", "month", "productName")`,
  `CREATE INDEX "Shipment_connectionId_occurredAt_idx" ON "Shipment"("connectionId", "occurredAt")`,
  `CREATE UNIQUE INDEX "Shipment_connectionId_externalId_key" ON "Shipment"("connectionId", "externalId")`,
  `CREATE UNIQUE INDEX "ShopifyStore_organizationId_shopDomain_key" ON "ShopifyStore"("organizationId", "shopDomain")`,
  `CREATE INDEX "ShopifyOrder_storeId_occurredAt_idx" ON "ShopifyOrder"("storeId", "occurredAt")`,
  `CREATE UNIQUE INDEX "ShopifyOrder_storeId_externalId_key" ON "ShopifyOrder"("storeId", "externalId")`,
  `CREATE INDEX "Requirement_organizationId_status_idx" ON "Requirement"("organizationId", "status")`,
  `CREATE INDEX "Comment_requirementId_createdAt_idx" ON "Comment"("requirementId", "createdAt")`,
  `CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read")`,
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

  const passwordHash = await bcrypt.hash("Jarvis2026!", 10);
  await db.user.create({
    data: {
      email: "importadorabellaav@gmail.com",
      passwordHash,
      name: "Fabrizio",
      role: "OWNER",
      mustChangePassword: true,
      organizationId: org.id,
    },
  });

  await db.user.create({
    data: {
      email: "reditusconsultingholding@gmail.com",
      passwordHash,
      name: "Sebastian",
      role: "DIRECTOR",
      mustChangePassword: true,
      organizationId: org.id,
    },
  });

  const editor = await db.user.create({
    data: {
      email: "editor.demo@reditusconsulting.com",
      passwordHash,
      name: "Valentina Ruiz",
      role: "EDITOR",
      mustChangePassword: true,
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

  type SeedRequirement = {
    productCode: string;
    adName: string;
    adType: string;
    phase: string;
    visualFormat: string;
    angle: string;
    awarenessLevel: string;
    marketOrigin: string;
    status: string;
    ownerId?: string;
    hookRate?: number;
    ctr?: number;
    holdRate?: number;
    purchases?: number;
    cpa?: number;
    frequency?: number;
    cpm?: number;
    nextAction?: string;
    notes?: string;
  };

  const requirements: SeedRequirement[] = [
    { productCode: "BAT-001", adName: "Batana UGC — Hook dolor capilar", adType: "FASE 1", phase: "F1", visualFormat: "UGC con Persona", angle: "Dolor Hiperspecífico", awarenessLevel: "L2 — Problem Aware", marketOrigin: "Colombia", status: "PENDIENTE" },
    { productCode: "FAJ-001", adName: "Faja — Testimonial transformación", adType: "VARIANTE", phase: "Escala", visualFormat: "Antes / Después", angle: "Transformación Emocional", awarenessLevel: "L3 — Solution Aware", marketOrigin: "Colombia", status: "EN_EDICION", ownerId: editor.id, hookRate: 32.4, ctr: 1.8 },
    { productCode: "TAB-001", adName: "Tabla de Picar — Demo sin persona", adType: "ORIGINAL", phase: "F1", visualFormat: "Demo sin Persona", angle: "Beneficios", awarenessLevel: "L1 — Unaware", marketOrigin: "Colombia", status: "LISTO_PARA_REVISAR", ownerId: editor.id },
    { productCode: "BOD-001", adName: "Body Reductor — Ugly ad one-take", adType: "FASE 2 / HOOK", phase: "CT 1.0", visualFormat: "Ugly Ad / One-take", angle: "Pattern Interrupt", awarenessLevel: "L2 — Problem Aware", marketOrigin: "Otro", status: "APROBADO", ownerId: editor.id },
    { productCode: "CEP-001", adName: "Cepillo — Testimonial screenshot", adType: "IMG ANUNCIO", phase: "OP", visualFormat: "Testimonial Screenshot", angle: "Review Screenshot", awarenessLevel: "L4 — Product Aware", marketOrigin: "Colombia", status: "REALIZADO", ownerId: editor.id },
    { productCode: "FAJ-001", adName: "Faja — Grid estático beneficios", adType: "IMAGEN", phase: "F1", visualFormat: "Grid Ad / Estático", angle: "Beneficios", awarenessLevel: "L2 — Problem Aware", marketOrigin: "México", status: "EDITADO" },
    { productCode: "BOD-001", adName: "Body Reductor — VSL corta resultado", adType: "FASE 1", phase: "Escala", visualFormat: "VSL Corta", angle: "Resultado con Métricas", awarenessLevel: "L3 — Solution Aware", marketOrigin: "Colombia", status: "TESTEADO", ownerId: editor.id, hookRate: 41.2, ctr: 2.3, holdRate: 18.5, purchases: 62, cpa: 9.4, frequency: 1.8, cpm: 12.1, nextAction: "Escalar presupuesto 30%", notes: "Mejor CPA del mes en este producto." },
  ];

  for (const r of requirements) {
    await db.requirement.create({
      data: {
        organizationId: org.id,
        productId: productByCode[r.productCode].id,
        adName: r.adName,
        adType: r.adType,
        phase: r.phase,
        visualFormat: r.visualFormat,
        angle: r.angle,
        awarenessLevel: r.awarenessLevel,
        marketOrigin: r.marketOrigin,
        status: r.status as never,
        ownerId: r.ownerId,
        hookRate: r.hookRate,
        ctr: r.ctr,
        holdRate: r.holdRate,
        purchases: r.purchases,
        cpa: r.cpa,
        frequency: r.frequency,
        cpm: r.cpm,
        nextAction: r.nextAction,
        notes: r.notes,
      },
    });
  }

  for (const row of PROFITABILITY_ABRIL_2026) {
    await db.productProfitability.create({
      data: {
        organizationId: org.id,
        month: PROFITABILITY_MONTH_ABRIL,
        productName: row.productName,
        orders: row.orders,
        cpa: row.cpa,
        revenueAccum: row.revenueAccum,
        adSpendAccum: row.adSpendAccum,
        operatingExpenseAccum: row.operatingExpenseAccum,
        adminExpenseAccum: row.adminExpenseAccum,
        profitAccum: row.profitAccum,
      },
    });
  }
}
