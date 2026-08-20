-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Production" (
    "id" TEXT NOT NULL,
    "productionNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "manufacturerCompanyId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "productionLine" TEXT,
    "plannedStartDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Production_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Production_version_check" CHECK ("version" >= 1),
    CONSTRAINT "Production_schedule_check" CHECK ("dueDate" IS NULL OR "plannedStartDate" IS NULL OR "dueDate" >= "plannedStartDate"),
    CONSTRAINT "Production_startedAt_check" CHECK ("status" NOT IN ('IN_PROGRESS', 'COMPLETED') OR "startedAt" IS NOT NULL),
    CONSTRAINT "Production_completedAt_check" CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "Production_productionNumber_key" ON "Production"("productionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Production_orderId_key" ON "Production"("orderId");

-- CreateIndex
CREATE INDEX "Production_manufacturerCompanyId_status_dueDate_idx" ON "Production"("manufacturerCompanyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Production_status_createdAt_idx" ON "Production"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_manufacturerCompanyId_fkey" FOREIGN KEY ("manufacturerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
