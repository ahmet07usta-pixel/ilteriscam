/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `ManufacturerCustomer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `address` to the `ManufacturerCustomer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city` to the `ManufacturerCustomer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `ManufacturerCustomer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `ManufacturerCustomer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taxNo` to the `ManufacturerCustomer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taxOffice` to the `ManufacturerCustomer` table without a default value. This is not possible if the table is not empty.
  - Made the column `region` on table `ManufacturerCustomer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `contactName` on table `ManufacturerCustomer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `ManufacturerCustomer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `ManufacturerCustomer` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ManufacturerCustomer" ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "taxNo" TEXT NOT NULL,
ADD COLUMN     "taxOffice" TEXT NOT NULL,
ALTER COLUMN "region" SET NOT NULL,
ALTER COLUMN "contactName" SET NOT NULL,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturerCustomer_code_key" ON "ManufacturerCustomer"("code");
