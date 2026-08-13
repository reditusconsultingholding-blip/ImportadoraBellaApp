-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "dueDate" DATETIME;
ALTER TABLE "Requirement" ADD COLUMN "thumbnailUrl" TEXT;

-- CreateTable
CREATE TABLE "RequirementVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requirementId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "note" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "authorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequirementVersion_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RequirementActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requirementId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequirementActivity_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RequirementVersion_requirementId_createdAt_idx" ON "RequirementVersion"("requirementId", "createdAt");

-- CreateIndex
CREATE INDEX "RequirementActivity_requirementId_createdAt_idx" ON "RequirementActivity"("requirementId", "createdAt");
