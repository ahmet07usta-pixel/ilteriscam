import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CalculationStatus,
  CompanyMembershipStatus,
  CompanyStatus,
  MeasurementStatus,
  PriceAdjustmentType,
  Prisma,
  QuotationStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calculatePricingLine } from '../pricing/calculation-engine';
import { PricingService } from '../pricing/pricing.service';
import { PERMISSIONS } from '../rbac/permissions';

@Injectable()
export class QuotationCalculationsService {
  private readonly engineVersion = '1.0.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly auditService: AuditService,
  ) {}

  async generate(quotationId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const quotation = await this.getManufacturerQuotation(quotationId, authenticatedActor, transaction);
        if (quotation.status !== QuotationStatus.DRAFT) {
          throw new ConflictException('Calculations can only be generated for draft quotations');
        }

        const requestItems = await transaction.requestItem.findMany({
          where: { requestId: quotation.requestId, measurementStatus: MeasurementStatus.APPROVED },
          orderBy: { lineNumber: 'asc' },
        });
        if (requestItems.length === 0) {
          throw new BadRequestException('At least one approved request item is required');
        }

        const generatedAt = new Date();
        const lineSnapshots = [];
        for (const requestItem of requestItems) {
          const selection = await this.pricingService.selectCatalog(
            quotation.manufacturerCompanyId,
            quotation.request.regionId,
            quotation.currency,
            requestItem,
            generatedAt,
            transaction,
          );
          const line = calculatePricingLine({
            measurement: requestItem,
            baseUnit: selection.catalog.baseUnit,
            unitPrice: selection.catalog.unitPrice,
            wasteRate: selection.catalog.defaultWasteRate,
            discountRate: selection.catalog.defaultDiscountRate,
            regionalAdjustment: selection.regionalAdjustment ? {
              type: selection.regionalAdjustment.adjustmentType,
              value: selection.regionalAdjustment.adjustmentValue,
            } : undefined,
            currency: quotation.currency,
          });
          lineSnapshots.push({
            requestItem: this.requestItemSnapshot(requestItem),
            pricing: this.pricingService.toSnapshot(selection),
            result: this.lineResultSnapshot(line),
          });
        }

        const snapshotPayload = {
          schemaVersion: 1,
          engineVersion: this.engineVersion,
          quotation: {
            id: quotation.id,
            requestId: quotation.requestId,
            manufacturerCompanyId: quotation.manufacturerCompanyId,
            revisionNumber: quotation.revisionNumber,
            currency: quotation.currency,
            regionId: quotation.request.regionId,
          },
          lines: lineSnapshots,
        };
        const inputHash = this.hashSnapshot(snapshotPayload);
        const existing = await transaction.quotationCalculation.findUnique({
          where: {
            quotationId_quotationRevisionNumber_inputHash: {
              quotationId,
              quotationRevisionNumber: quotation.revisionNumber,
              inputHash,
            },
          },
          include: { items: { orderBy: { lineNumber: 'asc' } } },
        });
        if (existing) return existing;

        const latest = await transaction.quotationCalculation.findFirst({
          where: { quotationId, quotationRevisionNumber: quotation.revisionNumber },
          orderBy: { calculationVersion: 'desc' },
          select: { calculationVersion: true },
        });
        const totals = this.aggregate(lineSnapshots.map((snapshot) => snapshot.result));
        const calculation = await transaction.quotationCalculation.create({
          data: {
            quotationId,
            requestId: quotation.requestId,
            quotationRevisionNumber: quotation.revisionNumber,
            calculationVersion: (latest?.calculationVersion ?? 0) + 1,
            engineVersion: this.engineVersion,
            inputHash,
            currency: quotation.currency,
            ...totals,
            snapshotSchemaVersion: 1,
            snapshotPayload,
            snapshotHash: inputHash,
            status: CalculationStatus.GENERATED,
            createdByUserId: authenticatedActor.sub,
          },
        });
        await transaction.quotationItem.createMany({
          data: lineSnapshots.map((snapshot, index) => ({
            quotationId,
            quotationCalculationId: calculation.id,
            requestItemId: snapshot.requestItem.id,
            priceCatalogItemId: snapshot.pricing.catalog.id,
            lineNumber: index + 1,
            description: snapshot.requestItem.description,
            quantity: snapshot.result.quantity,
            unit: snapshot.result.unit,
            unitPrice: snapshot.result.unitPrice,
            wasteRate: snapshot.result.wasteRate,
            wasteQuantity: snapshot.result.wasteQuantity,
            regionalAdjustmentRate: snapshot.result.regionalAdjustmentRate,
            regionalAdjustmentAmount: snapshot.result.regionalAdjustmentAmount,
            discountRate: snapshot.result.discountRate,
            discountAmount: snapshot.result.discountAmount,
            taxRate: 0,
            taxAmount: 0,
            subtotalAmount: snapshot.result.subtotalAmount,
            totalAmount: snapshot.result.totalAmount,
            currency: snapshot.result.currency,
          })),
        });
        const persisted = await transaction.quotationCalculation.findUniqueOrThrow({
          where: { id: calculation.id },
          include: { items: { orderBy: { lineNumber: 'asc' } } },
        });
        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'QUOTATION_CALCULATION_CREATED',
          resource: 'quotation_calculation',
          resourceId: calculation.id,
          metadata: this.auditMetadata(persisted, authenticatedActor.sub),
        }, transaction);
        return persisted;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002') || this.isPrismaError(error, 'P2034')) {
        throw new ConflictException('Quotation calculation changed concurrently');
      }
      throw error;
    }
  }

  async finalize(
    quotationId: string,
    calculationId: string,
    quotationVersion: number,
    calculationVersion: number,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const quotation = await this.getManufacturerQuotation(quotationId, authenticatedActor, transaction);
        if (quotation.status !== QuotationStatus.DRAFT) {
          throw new ConflictException('Calculations can only be finalized for draft quotations');
        }
        const calculation = await transaction.quotationCalculation.findFirst({
          where: { id: calculationId, quotationId },
        });
        if (!calculation) throw new NotFoundException('Quotation calculation not found');
        if (calculation.requestId !== quotation.requestId) {
          throw new ConflictException('Calculation does not belong to the quotation request');
        }
        if (calculation.quotationRevisionNumber !== quotation.revisionNumber) {
          throw new ConflictException('Calculation belongs to an earlier quotation revision');
        }

        const finalized = await transaction.quotationCalculation.findFirst({
          where: {
            quotationId,
            quotationRevisionNumber: quotation.revisionNumber,
            status: CalculationStatus.FINALIZED,
          },
          select: { id: true },
        });
        if (finalized) {
          throw new ConflictException('This quotation revision already has a finalized calculation');
        }

        const calculationUpdate = await transaction.quotationCalculation.updateMany({
          where: {
            id: calculationId,
            quotationId,
            quotationRevisionNumber: quotation.revisionNumber,
            calculationVersion,
            status: CalculationStatus.GENERATED,
          },
          data: { status: CalculationStatus.FINALIZED, finalizedAt: new Date() },
        });
        this.assertUpdated(calculationUpdate.count, 'Calculation was modified by another operation');

        const quotationUpdate = await transaction.quotation.updateMany({
          where: {
            id: quotationId,
            version: quotationVersion,
            revisionNumber: quotation.revisionNumber,
            status: QuotationStatus.DRAFT,
          },
          data: {
            activeCalculationId: calculationId,
            totalAmount: calculation.totalAmount,
            currency: calculation.currency,
            version: { increment: 1 },
          },
        });
        this.assertUpdated(quotationUpdate.count, 'Quotation was modified by another operation');

        const persisted = await transaction.quotationCalculation.findUniqueOrThrow({
          where: { id: calculationId },
          include: { items: { orderBy: { lineNumber: 'asc' } } },
        });
        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'QUOTATION_CALCULATION_FINALIZED',
          resource: 'quotation_calculation',
          resourceId: calculationId,
          metadata: this.auditMetadata(persisted, authenticatedActor.sub),
        }, transaction);
        return persisted;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002') || this.isPrismaError(error, 'P2034')) {
        throw new ConflictException('Quotation calculation changed concurrently');
      }
      throw error;
    }
  }

  async list(quotationId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedQuotation(quotationId, authenticatedActor);
    return this.prisma.quotationCalculation.findMany({
      where: { quotationId },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
      orderBy: [{ quotationRevisionNumber: 'desc' }, { calculationVersion: 'desc' }],
    });
  }

  async get(quotationId: string, calculationId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedQuotation(quotationId, authenticatedActor);
    const calculation = await this.prisma.quotationCalculation.findFirst({
      where: { id: calculationId, quotationId },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!calculation) throw new NotFoundException('Quotation calculation not found');
    return calculation;
  }

  private async getScopedQuotation(
    quotationId: string,
    actor: AuthenticatedUser,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const quotation = await client.quotation.findFirst({
      where: { id: quotationId, ...this.buildScopeWhere(actor) },
      include: { request: true },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.companyId !== quotation.request.companyId) {
      throw new ConflictException('Quotation buyer company does not own the request');
    }
    return quotation;
  }

  private async getManufacturerQuotation(
    quotationId: string,
    actor: AuthenticatedUser,
    client: Prisma.TransactionClient | PrismaService,
  ) {
    const quotation = await client.quotation.findFirst({
      where: {
        id: quotationId,
        manufacturerCompany: {
          status: CompanyStatus.ACTIVE,
          ...(this.canManageScope(actor) ? {} : {
            memberships: {
              some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE },
            },
          }),
        },
      },
      include: { request: true },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.companyId !== quotation.request.companyId) {
      throw new ConflictException('Quotation buyer company does not own the request');
    }
    return quotation;
  }

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.QuotationWhereInput {
    if (this.canManageScope(actor)) return {};
    const membership = { some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE } };
    return {
      OR: [
        { company: { memberships: membership } },
        { manufacturerCompany: { memberships: membership } },
      ],
    };
  }

  private requestItemSnapshot(item: Record<string, any>) {
    return {
      id: item.id,
      lineNumber: item.lineNumber,
      description: item.description,
      productCode: item.productCode,
      productType: item.productType,
      measurementStatus: item.measurementStatus,
      quantity: this.decimalString(item.quantity),
      unit: item.unit,
      widthMm: this.decimalString(item.widthMm),
      heightMm: this.decimalString(item.heightMm),
      lengthMm: this.decimalString(item.lengthMm),
      depthMm: this.decimalString(item.depthMm),
      thicknessMm: this.decimalString(item.thicknessMm),
      calculatedAreaM2: this.decimalString(item.calculatedAreaM2),
      calculatedLengthM: this.decimalString(item.calculatedLengthM),
      calculatedVolumeM3: this.decimalString(item.calculatedVolumeM3),
      version: item.version,
    };
  }

  private lineResultSnapshot(result: ReturnType<typeof calculatePricingLine>) {
    return {
      quantity: result.quantity.toFixed(),
      unit: result.unit,
      unitPrice: result.unitPrice.toFixed(),
      wasteRate: result.wasteRate.toFixed(),
      wasteQuantity: result.wasteQuantity.toFixed(),
      baseAmount: result.baseAmount.toFixed(2),
      wasteAmount: result.wasteAmount.toFixed(2),
      regionalAdjustmentRate: result.regionalAdjustmentRate.toFixed(),
      regionalAdjustmentAmount: result.regionalAdjustmentAmount.toFixed(2),
      discountRate: result.discountRate.toFixed(),
      discountAmount: result.discountAmount.toFixed(2),
      subtotalAmount: result.subtotalAmount.toFixed(2),
      totalAmount: result.totalAmount.toFixed(2),
      currency: result.currency,
    };
  }

  private aggregate(lines: Array<ReturnType<QuotationCalculationsService['lineResultSnapshot']>>) {
    const sum = (field: keyof typeof lines[number]) => lines.reduce(
      (total, line) => total.add(String(line[field])),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return {
      subtotalAmount: sum('subtotalAmount'),
      wasteAmount: sum('wasteAmount'),
      regionalAdjustmentAmount: sum('regionalAdjustmentAmount'),
      discountAmount: sum('discountAmount'),
      taxAmount: new Prisma.Decimal(0),
      totalAmount: sum('totalAmount'),
    };
  }

  private hashSnapshot(snapshot: object): string {
    return createHash('sha256').update(this.stableStringify(snapshot)).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${this.stableStringify(entry)}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private decimalString(value: unknown): string | null {
    return value === null || value === undefined ? null : String(value);
  }

  private auditMetadata(calculation: {
    id: string;
    quotationId: string;
    quotationRevisionNumber: number;
    calculationVersion: number;
    status: CalculationStatus;
    inputHash: string;
  }, actorId: string) {
    return {
      quotationId: calculation.quotationId,
      calculationId: calculation.id,
      revisionNumber: calculation.quotationRevisionNumber,
      actorId,
      version: calculation.calculationVersion,
      status: calculation.status,
      inputHash: calculation.inputHash,
    };
  }

  private assertUpdated(count: number, message: string): void {
    if (count !== 1) throw new ConflictException(message);
  }

  private requireActor(actor?: AuthenticatedUser): AuthenticatedUser {
    if (!actor) throw new ForbiddenException('Authentication required');
    return actor;
  }

  private canManageScope(actor: AuthenticatedUser): boolean {
    return actor.role === Role.ADMIN
      || actor.role === Role.MANAGER
      || actor.permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}