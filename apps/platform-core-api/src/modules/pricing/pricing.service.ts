import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyMembershipStatus, PriceAdjustmentType, PriceCatalogStatus, Prisma, Role } from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreatePriceCatalogItemDto } from './dto/create-price-catalog-item.dto';
import { UpdatePriceCatalogItemDto } from './dto/update-price-catalog-item.dto';

type PricingRequestItem = {
  productCode: string | null;
  productType: string;
};

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const where = this.canManageScope(authenticatedActor)
      ? {}
      : {
          company: {
            memberships: {
              some: { userId: authenticatedActor.sub, status: CompanyMembershipStatus.ACTIVE },
            },
          },
        };

    return this.prisma.priceCatalogItem.findMany({
      where,
      orderBy: [{ createdAt: 'desc' as const }],
    });
  }

  async create(input: CreatePriceCatalogItemDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.assertCompanyMembership(input.companyId, authenticatedActor);

    try {
      return await this.prisma.priceCatalogItem.create({
        data: {
          companyId: input.companyId,
          productCode: input.productCode.trim(),
          productType: input.productType.trim(),
          description: input.description,
          baseUnit: input.baseUnit,
          unitPrice: input.unitPrice,
          currency: input.currency ?? 'TRY',
          minimumOrderAmount: input.minimumOrderAmount,
          defaultWasteRate: input.defaultWasteRate ?? 0,
          defaultDiscountRate: input.defaultDiscountRate ?? 0,
          status: input.status ?? PriceCatalogStatus.ACTIVE,
          createdByUserId: authenticatedActor.sub,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A price catalog item with this product code already exists for this company');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdatePriceCatalogItemDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.prisma.priceCatalogItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Price catalog item not found');
    }
    await this.assertCompanyMembership(existing.companyId, authenticatedActor);

    return this.prisma.priceCatalogItem.update({
      where: { id },
      data: {
        productType: input.productType?.trim(),
        description: input.description,
        unitPrice: input.unitPrice,
        currency: input.currency,
        minimumOrderAmount: input.minimumOrderAmount,
        defaultWasteRate: input.defaultWasteRate,
        defaultDiscountRate: input.defaultDiscountRate,
        status: input.status,
      },
    });
  }

  private async assertCompanyMembership(companyId: string, actor: AuthenticatedUser): Promise<void> {
    if (this.canManageScope(actor)) {
      return;
    }

    const membership = await this.prisma.companyUserMembership.findFirst({
      where: { companyId, userId: actor.sub, status: CompanyMembershipStatus.ACTIVE },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this company');
    }
  }

  private requireActor(actor?: AuthenticatedUser): AuthenticatedUser {
    if (!actor) {
      throw new ForbiddenException('Authentication required');
    }
    return actor;
  }

  private canManageScope(actor: AuthenticatedUser): boolean {
    return actor.role === Role.ADMIN
      || actor.role === Role.MANAGER
      || actor.permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
  }

  // Word-order-agnostic, case-insensitive signature: AI-suggested product types for the SAME product can come
  // back with words reordered between different photos (e.g. "Fume Temperli Cam" vs "Temperli Fume Cam"), but a
  // genuinely different product type never shares the exact same set of words - so this stays safe from false matches.
  private productTypeSignature(value: string): string {
    return value
      .trim()
      .toLocaleLowerCase('tr-TR')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  }

  async selectCatalog(
    manufacturerCompanyId: string,
    regionId: string | null,
    currency: string,
    requestItem: PricingRequestItem,
    at = new Date(),
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const normalizedProductType = requestItem.productType.trim();
    const requestedSignature = this.productTypeSignature(normalizedProductType);
    const poolCandidates = await client.priceCatalogItem.findMany({
      where: {
        companyId: manufacturerCompanyId,
        status: PriceCatalogStatus.ACTIVE,
        currency,
        ...(requestItem.productCode ? { productCode: requestItem.productCode } : {}),
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
          { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
        ],
      },
      include: {
        regionalAdjustments: regionId ? { where: { regionId } } : false,
      },
      orderBy: [{ version: 'desc' }, { productCode: 'asc' }],
    });
    const candidates = poolCandidates.filter((candidate) => (
      this.productTypeSignature(candidate.productType) === requestedSignature
    ));

    if (candidates.length === 0) {
      throw new BadRequestException(
        `No active price catalog item matches product type "${normalizedProductType}" (currency ${currency})`
        + `${requestItem.productCode ? ` and product code "${requestItem.productCode}"` : ''}`
        + '. Add a catalog entry with this exact product type (word order and case are ignored) or update the request item.',
      );
    }

    const identities = new Set(candidates.map((candidate) => (
      `${candidate.productCode}:${candidate.productType}:${candidate.baseUnit}:${candidate.currency}`
    )));
    if (identities.size !== 1) {
      throw new ConflictException('Price catalog selection is ambiguous');
    }

    const selected = candidates[0];
    const regionalAdjustments = selected.regionalAdjustments ?? [];
    if (regionalAdjustments.length > 1) {
      throw new ConflictException('Regional price adjustment selection is ambiguous');
    }
    const regionalAdjustment = regionalAdjustments[0] ?? null;
    if (
      regionalAdjustment?.adjustmentType === PriceAdjustmentType.FIXED_AMOUNT
      && regionalAdjustment.currency !== currency
    ) {
      throw new BadRequestException('Fixed regional adjustment currency does not match quotation currency');
    }

    return { catalog: selected, regionalAdjustment };
  }

  toSnapshot(selection: Awaited<ReturnType<PricingService['selectCatalog']>>) {
    const { catalog, regionalAdjustment } = selection;
    return {
      catalog: {
        id: catalog.id,
        companyId: catalog.companyId,
        productCode: catalog.productCode,
        productType: catalog.productType,
        baseUnit: catalog.baseUnit,
        unitPrice: this.decimalString(catalog.unitPrice),
        currency: catalog.currency,
        minimumOrderAmount: catalog.minimumOrderAmount
          ? this.decimalString(catalog.minimumOrderAmount)
          : null,
        defaultWasteRate: this.decimalString(catalog.defaultWasteRate),
        defaultDiscountRate: this.decimalString(catalog.defaultDiscountRate),
        version: catalog.version,
        validFrom: catalog.validFrom?.toISOString() ?? null,
        validUntil: catalog.validUntil?.toISOString() ?? null,
      },
      regionalAdjustment: regionalAdjustment ? {
        id: regionalAdjustment.id,
        regionId: regionalAdjustment.regionId,
        type: regionalAdjustment.adjustmentType,
        value: this.decimalString(regionalAdjustment.adjustmentValue),
        currency: regionalAdjustment.currency,
        version: regionalAdjustment.version,
      } : null,
    };
  }

  private decimalString(value: Prisma.Decimal): string {
    return value.toFixed();
  }
}