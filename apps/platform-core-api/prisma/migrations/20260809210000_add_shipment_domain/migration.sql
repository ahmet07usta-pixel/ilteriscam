-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'DELIVERED');

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "manufacturerCompanyId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PLANNED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "destinationAddress" TEXT NOT NULL,
    "plannedDepartureAt" TIMESTAMP(3) NOT NULL,
    "estimatedDeliveryAt" TIMESTAMP(3) NOT NULL,
    "departedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Shipment_version_check" CHECK ("version" >= 1),
    CONSTRAINT "Shipment_schedule_check" CHECK ("plannedDepartureAt" <= "estimatedDeliveryAt")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shipmentNumber_key" ON "Shipment"("shipmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_productionId_key" ON "Shipment"("productionId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_manufacturerCompanyId_status_plannedDepartureAt_idx" ON "Shipment"("manufacturerCompanyId", "status", "plannedDepartureAt");

-- CreateIndex
CREATE INDEX "Shipment_status_estimatedDeliveryAt_idx" ON "Shipment"("status", "estimatedDeliveryAt");

-- CreateIndex
CREATE INDEX "Shipment_status_createdAt_idx" ON "Shipment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_manufacturerCompanyId_fkey" FOREIGN KEY ("manufacturerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;