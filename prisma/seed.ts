import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PROFITABILITY_ABRIL_2026, PROFITABILITY_MONTH_ABRIL } from "../src/lib/profitability-data";

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
  // Salvaguarda: si ya hay una organización (o sea, si esto no es la
  // primera vez que se corre), no se toca nada. Sin esto, volver a correr
  // el seed borraría el token real que hayan conectado en Conexiones y
  // habría que volver a pegarlo — justo lo que no queremos.
  const existing = await db.organization.findFirst();
  if (existing) {
    console.log(
      `Ya hay datos (organización "${existing.name}"). No se vuelve a sembrar para no pisar cuentas ya conectadas.`
    );
    console.log("Si de verdad querés reiniciar todo desde cero, borrá prisma/dev.db a mano y corré el seed de nuevo.");
    return;
  }

  const org = await db.organization.create({
    data: { name: "Importadora Bella" },
  });

  const passwordHash = await bcrypt.hash("Jarvis2026!", 10);
  const user = await db.user.create({
    data: {
      email: "importadorabellaav@gmail.com",
      passwordHash,
      name: "Fabrizio",
      role: "OWNER",
      mustChangePassword: true,
      organizationId: org.id,
    },
  });

  const directorPasswordHash = await bcrypt.hash("Jarvis2026!", 10);
  const director = await db.user.create({
    data: {
      email: "reditusconsultingholding@gmail.com",
      passwordHash: directorPasswordHash,
      name: "Sebastian",
      role: "DIRECTOR",
      mustChangePassword: true,
      organizationId: org.id,
    },
  });

  const editorPasswordHash = await bcrypt.hash("Jarvis2026!", 10);
  const editor = await db.user.create({
    data: {
      email: "editor.demo@reditusconsulting.com",
      passwordHash: editorPasswordHash,
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
      connectedAt: null, // se llena cuando conectemos la cuenta real
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

  console.log("Seed listo.");
  console.log(`Login OWNER -> ${user.email} / Jarvis2026! (pide cambiar la clave al entrar)`);
  console.log(`Login DIRECTOR -> ${director.email} / Jarvis2026! (pide cambiar la clave al entrar)`);
  console.log(`Login EDITOR -> ${editor.email} / Jarvis2026! (pide cambiar la clave al entrar)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
