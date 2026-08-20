/*
  Warnings:

  - You are about to drop the column `manufacturerCompany` on the `ManufacturerCustomer` table. All the data in the column will be lost.
  - Added the required column `manufacturerCompanyId` to the `ManufacturerCustomer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ManufacturerCustomer" DROP COLUMN "manufacturerCompany",
ADD COLUMN     "manufacturerCompanyId" TEXT NOT NULL,
ADD COLUMN     "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "ManufacturerCustomer_manufacturerCompanyId_idx" ON "ManufacturerCustomer"("manufacturerCompanyId");

-- AddForeignKey
ALTER TABLE "ManufacturerCustomer" ADD CONSTRAINT "ManufacturerCustomer_manufacturerCompanyId_fkey" FOREIGN KEY ("manufacturerCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "QuotationCalculation_quotationId_quotationRevisionNumber_calcul" RENAME TO "QuotationCalculation_quotationId_quotationRevisionNumber_ca_key";

-- RenameIndex
ALTER INDEX "QuotationCalculation_quotationId_quotationRevisionNumber_inputH" RENAME TO "QuotationCalculation_quotationId_quotationRevisionNumber_in_key";
