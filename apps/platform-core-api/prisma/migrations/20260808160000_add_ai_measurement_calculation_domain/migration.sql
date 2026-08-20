-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('MM', 'CM', 'M', 'M2', 'M3', 'PIECE');

-- CreateEnum
CREATE TYPE "MeasurementSource" AS ENUM ('USER', 'AI', 'AI_CORRECTED', 'MANUAL_CORRECTION');

-- CreateEnum
CREATE TYPE "MeasurementStatus" AS ENUM ('PENDING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GeometryType" AS ENUM ('COUNT', 'LINE', 'RECTANGLE', 'VOLUME', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING_UPLOAD', 'AVAILABLE', 'QUARANTINED', 'DELETED');

-- CreateEnum
CREATE TYPE "AnalysisTaskType" AS ENUM ('MEASUREMENT_EXTRACTION');

-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnalysisReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "MeasurementReviewAction" AS ENUM ('APPROVE', 'REJECT', 'CORRECT');

-- CreateEnum
CREATE TYPE "PriceCatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PriceAdjustmentType" AS ENUM ('RATE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "CalculationStatus" AS ENUM ('GENERATED', 'FINALIZED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "activeCalculationId" TEXT;

-- CreateTable
CREATE TABLE "RequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "productCode" TEXT,
    "quantity" DECIMAL(18,6),
    "unit" "MeasurementUnit",
    "measurementSource" "MeasurementSource",
    "measurementStatus" "MeasurementStatus" NOT NULL DEFAULT 'PENDING',
    "widthMm" DECIMAL(18,6),
    "heightMm" DECIMAL(18,6),
    "lengthMm" DECIMAL(18,6),
    "depthMm" DECIMAL(18,6),
    "thicknessMm" DECIMAL(18,6),
    "calculatedAreaM2" DECIMAL(18,6),
    "calculatedLengthM" DECIMAL(18,6),
    "calculatedVolumeM3" DECIMAL(18,6),
    "sourceAnalysisResultId" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RequestItem_lineNumber_check" CHECK ("lineNumber" > 0),
    CONSTRAINT "RequestItem_version_check" CHECK ("version" >= 1),
    CONSTRAINT "RequestItem_quantity_check" CHECK ("quantity" IS NULL OR "quantity" >= 0)
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestItemId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "analysisEligible" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Attachment_sizeBytes_check" CHECK ("sizeBytes" >= 0),
    CONSTRAINT "Attachment_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestItemId" TEXT,
    "attachmentId" TEXT NOT NULL,
    "taskType" "AnalysisTaskType" NOT NULL DEFAULT 'MEASUREMENT_EXTRACTION',
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnalysisJob_attempts_check" CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0 AND "attemptCount" <= "maxAttempts"),
    CONSTRAINT "AnalysisJob_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" TEXT NOT NULL,
    "analysisJobId" TEXT NOT NULL,
    "resultVersion" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "confidence" DECIMAL(5,4),
    "warnings" JSONB,
    "assumptions" JSONB,
    "rawOutputStorageKey" TEXT,
    "reviewStatus" "AnalysisReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnalysisResult_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
    CONSTRAINT "AnalysisResult_versions_check" CHECK ("resultVersion" >= 1 AND "schemaVersion" >= 1 AND "version" >= 1)
);

-- CreateTable
CREATE TABLE "DetectedMeasurement" (
    "id" TEXT NOT NULL,
    "analysisResultId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "label" TEXT,
    "geometryType" "GeometryType" NOT NULL,
    "widthMm" DECIMAL(18,6),
    "heightMm" DECIMAL(18,6),
    "lengthMm" DECIMAL(18,6),
    "depthMm" DECIMAL(18,6),
    "thicknessMm" DECIMAL(18,6),
    "quantity" DECIMAL(18,6),
    "unit" "MeasurementUnit",
    "calculatedAreaM2" DECIMAL(18,6),
    "calculatedLengthM" DECIMAL(18,6),
    "calculatedVolumeM3" DECIMAL(18,6),
    "confidence" DECIMAL(5,4),
    "warnings" JSONB,
    "assumptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetectedMeasurement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DetectedMeasurement_ordinal_check" CHECK ("ordinal" > 0),
    CONSTRAINT "DetectedMeasurement_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
    CONSTRAINT "DetectedMeasurement_quantity_check" CHECK ("quantity" IS NULL OR "quantity" >= 0)
);

-- CreateTable
CREATE TABLE "MeasurementReview" (
    "id" TEXT NOT NULL,
    "analysisResultId" TEXT NOT NULL,
    "detectedMeasurementId" TEXT,
    "requestItemId" TEXT NOT NULL,
    "action" "MeasurementReviewAction" NOT NULL,
    "reviewedByUserId" TEXT,
    "correctedQuantity" DECIMAL(18,6),
    "correctedUnit" "MeasurementUnit",
    "correctedWidthMm" DECIMAL(18,6),
    "correctedHeightMm" DECIMAL(18,6),
    "correctedLengthMm" DECIMAL(18,6),
    "correctedDepthMm" DECIMAL(18,6),
    "correctedThicknessMm" DECIMAL(18,6),
    "correctedAreaM2" DECIMAL(18,6),
    "correctedLengthM" DECIMAL(18,6),
    "correctedVolumeM3" DECIMAL(18,6),
    "reason" TEXT,
    "resultVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurementReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MeasurementReview_resultVersion_check" CHECK ("resultVersion" >= 1),
    CONSTRAINT "MeasurementReview_quantity_check" CHECK ("correctedQuantity" IS NULL OR "correctedQuantity" >= 0)
);

-- CreateTable
CREATE TABLE "PriceCatalogItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "description" TEXT,
    "baseUnit" "MeasurementUnit" NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "minimumOrderAmount" DECIMAL(18,2),
    "defaultWasteRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "defaultDiscountRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "optionConfig" JSONB,
    "status" "PriceCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceCatalogItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriceCatalogItem_unitPrice_check" CHECK ("unitPrice" >= 0),
    CONSTRAINT "PriceCatalogItem_minimumOrderAmount_check" CHECK ("minimumOrderAmount" IS NULL OR "minimumOrderAmount" >= 0),
    CONSTRAINT "PriceCatalogItem_rates_check" CHECK ("defaultWasteRate" >= 0 AND "defaultDiscountRate" >= 0 AND "defaultDiscountRate" <= 1),
    CONSTRAINT "PriceCatalogItem_version_check" CHECK ("version" >= 1),
    CONSTRAINT "PriceCatalogItem_validity_check" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" > "validFrom")
);

-- CreateTable
CREATE TABLE "PriceRegionalAdjustment" (
    "id" TEXT NOT NULL,
    "priceCatalogItemId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "adjustmentType" "PriceAdjustmentType" NOT NULL DEFAULT 'RATE',
    "adjustmentValue" DECIMAL(18,6) NOT NULL,
    "currency" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceRegionalAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriceRegionalAdjustment_version_check" CHECK ("version" >= 1),
    CONSTRAINT "PriceRegionalAdjustment_currency_check" CHECK ("adjustmentType" <> 'FIXED_AMOUNT' OR "currency" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "QuotationCalculation" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "quotationRevisionNumber" INTEGER NOT NULL,
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "engineVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotalAmount" DECIMAL(18,2) NOT NULL,
    "wasteAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "regionalAdjustmentAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshotPayload" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "status" "CalculationStatus" NOT NULL DEFAULT 'GENERATED',
    "createdByUserId" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationCalculation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuotationCalculation_versions_check" CHECK ("quotationRevisionNumber" >= 1 AND "calculationVersion" >= 1 AND "snapshotSchemaVersion" >= 1),
    CONSTRAINT "QuotationCalculation_amounts_check" CHECK ("subtotalAmount" >= 0 AND "wasteAmount" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND "totalAmount" >= 0),
    CONSTRAINT "QuotationCalculation_finalizedAt_check" CHECK ("status" <> 'FINALIZED' OR "finalizedAt" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "quotationCalculationId" TEXT NOT NULL,
    "requestItemId" TEXT,
    "priceCatalogItemId" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" "MeasurementUnit" NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "wasteRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "wasteQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "regionalAdjustmentRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "regionalAdjustmentAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotalAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuotationItem_lineNumber_check" CHECK ("lineNumber" > 0),
    CONSTRAINT "QuotationItem_quantity_price_check" CHECK ("quantity" >= 0 AND "unitPrice" >= 0 AND "wasteQuantity" >= 0),
    CONSTRAINT "QuotationItem_rates_check" CHECK ("wasteRate" >= 0 AND "discountRate" >= 0 AND "discountRate" <= 1 AND "taxRate" >= 0),
    CONSTRAINT "QuotationItem_amounts_check" CHECK ("discountAmount" >= 0 AND "taxAmount" >= 0 AND "subtotalAmount" >= 0 AND "totalAmount" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_activeCalculationId_key" ON "Quotation"("activeCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestItem_requestId_lineNumber_key" ON "RequestItem"("requestId", "lineNumber");
CREATE INDEX "RequestItem_requestId_measurementStatus_idx" ON "RequestItem"("requestId", "measurementStatus");
CREATE INDEX "RequestItem_sourceAnalysisResultId_idx" ON "RequestItem"("sourceAnalysisResultId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_requestId_status_createdAt_idx" ON "Attachment"("requestId", "status", "createdAt");
CREATE INDEX "Attachment_requestItemId_idx" ON "Attachment"("requestItemId");
CREATE INDEX "Attachment_checksum_idx" ON "Attachment"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisJob_requestId_idempotencyKey_key" ON "AnalysisJob"("requestId", "idempotencyKey");
CREATE INDEX "AnalysisJob_requestId_status_createdAt_idx" ON "AnalysisJob"("requestId", "status", "createdAt");
CREATE INDEX "AnalysisJob_requestItemId_idx" ON "AnalysisJob"("requestItemId");
CREATE INDEX "AnalysisJob_attachmentId_idx" ON "AnalysisJob"("attachmentId");
CREATE INDEX "AnalysisJob_status_leaseExpiresAt_idx" ON "AnalysisJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisResult_analysisJobId_resultVersion_key" ON "AnalysisResult"("analysisJobId", "resultVersion");
CREATE INDEX "AnalysisResult_reviewStatus_createdAt_idx" ON "AnalysisResult"("reviewStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DetectedMeasurement_analysisResultId_ordinal_key" ON "DetectedMeasurement"("analysisResultId", "ordinal");
CREATE INDEX "DetectedMeasurement_analysisResultId_geometryType_idx" ON "DetectedMeasurement"("analysisResultId", "geometryType");

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementReview_analysisResultId_requestItemId_key" ON "MeasurementReview"("analysisResultId", "requestItemId");
CREATE INDEX "MeasurementReview_requestItemId_createdAt_idx" ON "MeasurementReview"("requestItemId", "createdAt");
CREATE INDEX "MeasurementReview_detectedMeasurementId_idx" ON "MeasurementReview"("detectedMeasurementId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceCatalogItem_companyId_productCode_version_key" ON "PriceCatalogItem"("companyId", "productCode", "version");
CREATE INDEX "PriceCatalogItem_companyId_status_validFrom_idx" ON "PriceCatalogItem"("companyId", "status", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PriceRegionalAdjustment_priceCatalogItemId_regionId_key" ON "PriceRegionalAdjustment"("priceCatalogItemId", "regionId");
CREATE INDEX "PriceRegionalAdjustment_regionId_idx" ON "PriceRegionalAdjustment"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationCalculation_snapshotHash_key" ON "QuotationCalculation"("snapshotHash");
CREATE UNIQUE INDEX "QuotationCalculation_quotationId_quotationRevisionNumber_calculationVersion_key" ON "QuotationCalculation"("quotationId", "quotationRevisionNumber", "calculationVersion");
CREATE UNIQUE INDEX "QuotationCalculation_quotationId_quotationRevisionNumber_inputHash_key" ON "QuotationCalculation"("quotationId", "quotationRevisionNumber", "inputHash");
CREATE UNIQUE INDEX "QuotationCalculation_one_finalized_per_revision_key" ON "QuotationCalculation"("quotationId", "quotationRevisionNumber") WHERE "status" = 'FINALIZED';
CREATE INDEX "QuotationCalculation_requestId_createdAt_idx" ON "QuotationCalculation"("requestId", "createdAt");
CREATE INDEX "QuotationCalculation_quotationId_status_idx" ON "QuotationCalculation"("quotationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationItem_quotationCalculationId_lineNumber_key" ON "QuotationItem"("quotationCalculationId", "lineNumber");
CREATE INDEX "QuotationItem_quotationId_lineNumber_idx" ON "QuotationItem"("quotationId", "lineNumber");
CREATE INDEX "QuotationItem_requestItemId_idx" ON "QuotationItem"("requestItemId");
CREATE INDEX "QuotationItem_priceCatalogItemId_idx" ON "QuotationItem"("priceCatalogItemId");

-- AddForeignKey
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_sourceAnalysisResultId_fkey" FOREIGN KEY ("sourceAnalysisResultId") REFERENCES "AnalysisResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "RequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "RequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DetectedMeasurement" ADD CONSTRAINT "DetectedMeasurement_analysisResultId_fkey" FOREIGN KEY ("analysisResultId") REFERENCES "AnalysisResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeasurementReview" ADD CONSTRAINT "MeasurementReview_analysisResultId_fkey" FOREIGN KEY ("analysisResultId") REFERENCES "AnalysisResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeasurementReview" ADD CONSTRAINT "MeasurementReview_detectedMeasurementId_fkey" FOREIGN KEY ("detectedMeasurementId") REFERENCES "DetectedMeasurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeasurementReview" ADD CONSTRAINT "MeasurementReview_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "RequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeasurementReview" ADD CONSTRAINT "MeasurementReview_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PriceCatalogItem" ADD CONSTRAINT "PriceCatalogItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceCatalogItem" ADD CONSTRAINT "PriceCatalogItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PriceRegionalAdjustment" ADD CONSTRAINT "PriceRegionalAdjustment_priceCatalogItemId_fkey" FOREIGN KEY ("priceCatalogItemId") REFERENCES "PriceCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceRegionalAdjustment" ADD CONSTRAINT "PriceRegionalAdjustment_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuotationCalculation" ADD CONSTRAINT "QuotationCalculation_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationCalculation" ADD CONSTRAINT "QuotationCalculation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationCalculation" ADD CONSTRAINT "QuotationCalculation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationCalculationId_fkey" FOREIGN KEY ("quotationCalculationId") REFERENCES "QuotationCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "RequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_priceCatalogItemId_fkey" FOREIGN KEY ("priceCatalogItemId") REFERENCES "PriceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_activeCalculationId_fkey" FOREIGN KEY ("activeCalculationId") REFERENCES "QuotationCalculation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
