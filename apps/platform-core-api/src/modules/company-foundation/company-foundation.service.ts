import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, CompanyMembershipStatus, CompanyStatus, CompanyType, CompanyVerificationStatus, Prisma, Region, Role } from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../rbac/permissions';

@Injectable()
export class CompanyFoundationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listCompanies(actor?: AuthenticatedUser): Promise<Company[]> {
    const where = this.buildCompanyScopeWhere(actor);

    return this.prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        region: true,
        memberships: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });
  }

  async getCompany(companyId: string, actor?: AuthenticatedUser): Promise<Company> {
    await this.assertCompanyAccess(companyId, actor);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        region: true,
        memberships: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async createCompany(
    input: {
      legalName: string;
      tradeName?: string;
      companyType?: CompanyType;
      regionId?: string;
      contactEmail?: string;
      contactPhone?: string;
      taxNumber?: string;
      iban?: string;
      verificationStatus?: CompanyVerificationStatus;
      status?: CompanyStatus;
    },
    actor?: AuthenticatedUser,
  ): Promise<Company> {
    if (!input.legalName || input.legalName.trim().length < 2) {
      throw new BadRequestException('legalName must be at least 2 characters');
    }

    this.assertCreatePermission(actor);

    if (input.regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: input.regionId } });
      if (!region) {
        throw new BadRequestException('Region not found');
      }
    }

    const initialStatus = input.status ?? CompanyStatus.ACTIVE;
    const company = await this.prisma.company.create({
      data: {
        legalName: input.legalName,
        tradeName: input.tradeName,
        companyType: input.companyType ?? CompanyType.OTHER,
        regionId: input.regionId,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        taxNumber: input.taxNumber,
        iban: input.iban,
        verificationStatus: input.verificationStatus ?? CompanyVerificationStatus.PENDING,
        status: initialStatus,
        activatedAt: initialStatus === CompanyStatus.ACTIVE ? new Date() : null,
      },
      include: {
        region: true,
        memberships: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });

    if (actor?.sub) {
      await this.auditService.record({
        actorId: actor.sub,
        action: 'CREATE',
        resource: 'company',
        resourceId: company.id,
        metadata: { legalName: company.legalName },
      });
    }

    return company;
  }

  async updateCompany(
    companyId: string,
    input: {
      legalName?: string;
      tradeName?: string;
      companyType?: CompanyType;
      regionId?: string;
      contactEmail?: string;
      contactPhone?: string;
      taxNumber?: string;
      iban?: string;
      verificationStatus?: CompanyVerificationStatus;
      status?: CompanyStatus;
    },
    actor?: AuthenticatedUser,
  ): Promise<Company> {
    await this.assertCompanyAccess(companyId, actor);

    const existing = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!existing) {
      throw new NotFoundException('Company not found');
    }

    if (input.regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: input.regionId } });
      if (!region) {
        throw new BadRequestException('Region not found');
      }
    }

    const activatesNow = input.status === CompanyStatus.ACTIVE && existing.status !== CompanyStatus.ACTIVE;
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: activatesNow ? { ...input, activatedAt: new Date() } : input,
      include: {
        region: true,
        memberships: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });

    if (actor?.sub) {
      await this.auditService.record({
        actorId: actor.sub,
        action: 'UPDATE',
        resource: 'company',
        resourceId: company.id,
        metadata: { changes: input },
      });
    }

    return company;
  }

  async listRegions(actor?: AuthenticatedUser): Promise<Region[]> {
    void actor;

    return this.prisma.region.findMany({
      orderBy: { createdAt: 'desc' },
      include: { children: true, parentRegion: true },
    });
  }

  async getRegion(regionId: string, actor?: AuthenticatedUser): Promise<Region> {
    if (!actor) {
      throw new ForbiddenException('Authentication required');
    }

    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      include: { children: true, parentRegion: true },
    });

    if (!region) {
      throw new NotFoundException('Region not found');
    }

    return region;
  }

  async createRegion(
    input: {
      name: string;
      parentRegionId?: string;
      regionType?: Region['regionType'];
      code?: string;
      country?: string;
      city?: string;
      timezone?: string;
      status?: Region['status'];
    },
    actor?: AuthenticatedUser,
  ): Promise<Region> {
    this.assertAdminOrManager(actor);

    if (input.parentRegionId) {
      await this.assertRegionExists(input.parentRegionId, 'Parent region not found');
    }

    const region = await this.prisma.region.create({
      data: {
        name: input.name,
        parentRegionId: input.parentRegionId,
        regionType: input.regionType ?? 'CITY',
        code: input.code,
        country: input.country,
        city: input.city,
        timezone: input.timezone,
        status: input.status ?? 'ACTIVE',
      },
    });

    if (actor?.sub) {
      await this.auditService.record({
        actorId: actor.sub,
        action: 'CREATE',
        resource: 'region',
        resourceId: region.id,
        metadata: { name: region.name },
      });
    }

    return region;
  }

  async updateRegion(
    regionId: string,
    input: {
      name?: string;
      parentRegionId?: string | null;
      regionType?: Region['regionType'];
      code?: string;
      country?: string;
      city?: string;
      timezone?: string;
      status?: Region['status'];
    },
    actor?: AuthenticatedUser,
  ): Promise<Region> {
    this.assertAdminOrManager(actor);
    await this.assertRegionExists(regionId, 'Region not found', true);

    if (input.parentRegionId !== undefined && input.parentRegionId !== null) {
      await this.assertValidRegionParent(regionId, input.parentRegionId);
    }

    const region = await this.prisma.region.update({
      where: { id: regionId },
      data: input,
      include: { children: true, parentRegion: true },
    });

    if (actor?.sub) {
      await this.auditService.record({
        actorId: actor.sub,
        action: 'UPDATE',
        resource: 'region',
        resourceId: region.id,
        metadata: { changes: input },
      });
    }

    return region;
  }

  async listMemberships(companyId: string, actor?: AuthenticatedUser): Promise<any[]> {
    await this.assertCompanyAccess(companyId, actor);

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.companyUserMembership.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
    });
  }

  async addMembership(companyId: string, userId: string, role: string, actor?: AuthenticatedUser): Promise<any> {
    await this.assertCompanyManagementAccess(companyId, actor);

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.companyUserMembership.findUnique({
      where: {
        companyId_userId: { companyId, userId },
      },
    });

    if (existing) {
      throw new ConflictException('User is already a member of this company');
    }

    let membership;
    try {
      membership = await this.prisma.companyUserMembership.create({
        data: {
          companyId,
          userId,
          role,
          status: CompanyMembershipStatus.ACTIVE,
        },
        include: { user: { select: { id: true, fullName: true, email: true, role: true } }, company: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User is already a member of this company');
      }
      throw error;
    }

    if (actor?.sub) {
      await this.auditService.record({
        actorId: actor.sub,
        action: 'CREATE',
        resource: 'company-membership',
        resourceId: membership.id,
        metadata: { companyId, userId, role },
      });
    }

    return membership;
  }

  async removeMembership(companyId: string, userId: string, actor?: AuthenticatedUser): Promise<void> {
    await this.assertCompanyManagementAccess(companyId, actor);

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const membership = await this.prisma.companyUserMembership.findUnique({
      where: {
        companyId_userId: { companyId, userId },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    await this.prisma.companyUserMembership.delete({ where: { id: membership.id } });

    if (actor?.sub) {
      await this.auditService.record({
        actorId: actor.sub,
        action: 'DELETE',
        resource: 'company-membership',
        resourceId: membership.id,
        metadata: { companyId, userId },
      });
    }
  }

  private buildCompanyScopeWhere(actor?: AuthenticatedUser) {
    if (!actor) {
      return undefined;
    }

    if (this.canManageScope(actor)) {
      return undefined;
    }

    return {
      memberships: {
        some: {
          userId: actor.sub,
          status: CompanyMembershipStatus.ACTIVE,
        },
      },
    };
  }

  private async assertRegionExists(regionId: string, message: string, notFound = false): Promise<void> {
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });

    if (!region) {
      if (notFound) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }

  private async assertValidRegionParent(regionId: string, parentRegionId: string): Promise<void> {
    if (regionId === parentRegionId) {
      throw new BadRequestException('Region cannot be its own parent');
    }

    let currentRegionId: string | null = parentRegionId;
    while (currentRegionId) {
      const currentRegion: { id: string; parentRegionId: string | null } | null = await this.prisma.region.findUnique({
        where: { id: currentRegionId },
        select: { id: true, parentRegionId: true },
      });

      if (!currentRegion) {
        throw new BadRequestException('Parent region not found');
      }
      if (currentRegion.id === regionId) {
        throw new BadRequestException('Region hierarchy cannot contain a cycle');
      }

      currentRegionId = currentRegion.parentRegionId;
    }
  }

  private async assertCompanyAccess(companyId: string, actor?: AuthenticatedUser): Promise<void> {
    if (!actor) {
      throw new ForbiddenException('Authentication required');
    }

    if (this.canManageScope(actor)) {
      return;
    }

    const membership = await this.prisma.companyUserMembership.findFirst({
      where: {
        companyId,
        userId: actor.sub,
        status: CompanyMembershipStatus.ACTIVE,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this company');
    }
  }

  private async assertCompanyManagementAccess(companyId: string, actor?: AuthenticatedUser): Promise<void> {
    if (!actor) {
      throw new ForbiddenException('Authentication required');
    }

    if (this.canManageScope(actor)) {
      return;
    }

    const membership = await this.prisma.companyUserMembership.findFirst({
      where: {
        companyId,
        userId: actor.sub,
        status: CompanyMembershipStatus.ACTIVE,
        role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have permission to manage this company');
    }
  }

  private assertCreatePermission(actor?: AuthenticatedUser): void {
    if (!actor) {
      throw new ForbiddenException('Authentication required');
    }

    if (this.canManageScope(actor)) {
      return;
    }

    throw new ForbiddenException('You do not have permission to create companies');
  }

  private assertAdminOrManager(actor?: AuthenticatedUser): void {
    if (!actor) {
      throw new ForbiddenException('Authentication required');
    }

    if (actor.role === Role.ADMIN || actor.role === Role.MANAGER || actor.permissions.includes(PERMISSIONS.PLATFORM_ADMIN)) {
      return;
    }

    throw new ForbiddenException('Only admins and managers can manage regions');
  }

  private canManageScope(actor?: AuthenticatedUser): boolean {
    if (!actor) {
      return false;
    }

    return actor.role === Role.ADMIN || actor.role === Role.MANAGER || actor.permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
  }
}
