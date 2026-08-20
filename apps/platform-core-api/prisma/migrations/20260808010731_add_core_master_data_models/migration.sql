-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('GLASS_PRODUCER', 'ALUMINUM', 'PVC', 'BALCONY', 'FURNITURE', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RegionType" AS ENUM ('COUNTRY', 'CITY', 'DISTRICT', 'ZONE');

-- CreateEnum
CREATE TYPE "RegionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CompanyMembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "companyType" "CompanyType" NOT NULL DEFAULT 'OTHER',
    "regionId" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "taxNumber" TEXT,
    "verificationStatus" "CompanyVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentRegionId" TEXT,
    "regionType" "RegionType" NOT NULL DEFAULT 'CITY',
    "code" TEXT,
    "country" TEXT,
    "city" TEXT,
    "timezone" TEXT,
    "status" "RegionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyUserMembership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" "CompanyMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyUserMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Company_regionId_idx" ON "Company"("regionId");

-- CreateIndex
CREATE INDEX "Company_verificationStatus_idx" ON "Company"("verificationStatus");

-- CreateIndex
CREATE INDEX "Region_parentRegionId_idx" ON "Region"("parentRegionId");

-- CreateIndex
CREATE INDEX "Region_status_idx" ON "Region"("status");

-- CreateIndex
CREATE INDEX "CompanyUserMembership_companyId_idx" ON "CompanyUserMembership"("companyId");

-- CreateIndex
CREATE INDEX "CompanyUserMembership_userId_idx" ON "CompanyUserMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUserMembership_companyId_userId_key" ON "CompanyUserMembership"("companyId", "userId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_parentRegionId_fkey" FOREIGN KEY ("parentRegionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUserMembership" ADD CONSTRAINT "CompanyUserMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUserMembership" ADD CONSTRAINT "CompanyUserMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
