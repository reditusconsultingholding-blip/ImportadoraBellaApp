-- CreateTable
CREATE TABLE "ShopifyStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT,
    "connectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopifyStore_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopifyOrder" (
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
);

-- CreateTable
CREATE TABLE "ShopifyOrderLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT,
    "quantity" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "ShopifyOrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyStore_organizationId_shopDomain_key" ON "ShopifyStore"("organizationId", "shopDomain");

-- CreateIndex
CREATE INDEX "ShopifyOrder_storeId_occurredAt_idx" ON "ShopifyOrder"("storeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrder_storeId_externalId_key" ON "ShopifyOrder"("storeId", "externalId");
