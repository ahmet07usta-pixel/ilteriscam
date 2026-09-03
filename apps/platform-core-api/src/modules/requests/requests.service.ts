import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyMembershipStatus,
  CompanyStatus,
  CompanyType,
  Prisma,
  RegionStatus,
  RequestStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateRequestDto } from './dto/create-request.dto';
import { ReplaceRequestRecipientsDto } from './dto/replace-request-recipients.dto';
import { UpdateRequestDto } from './dto/update-request.dto';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(input: CreateRequestDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const company = await this.assertActiveCompanyMembership(input.companyId, authenticatedActor);
    await this.assertRegionAccess(input.regionId, company.regionId, authenticatedActor);
    this.assertBudgetRange(input.budgetMin, input.budgetMax);

    const recipientCompanyIds = await this.validateRecipientCompanies(
      input.companyId,
      input.recipientCompanyIds ?? [],
    );

    const request = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.request.create({
        data: {
          requestNumber: this.createRequestNumber(),
          companyId: input.companyId,
          regionId: input.regionId,
          createdByUserId: authenticatedActor.sub,
          title: input.title.trim(),
          description: input.description,
          productType: input.productType.trim(),
          quantity: input.quantity,
          unit: input.unit,
          targetDeliveryDate: input.targetDeliveryDate ? new Date(input.targetDeliveryDate) : undefined,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          currency: input.currency ?? 'TRY',
          status: RequestStatus.DRAFT,
        },
      });

      if (recipientCompanyIds.length > 0) {
        await transaction.requestRecipient.createMany({
          data: recipientCompanyIds.map((companyId) => ({ requestId: created.id, companyId })),
        });
      }

      return transaction.request.findUniqueOrThrow({
        where: { id: created.id },
        include: this.ownerInclude,
      });
    });

    await this.auditService.record({
      actorId: authenticatedActor.sub,
      action: 'CREATE',
      resource: 'request',
      resourceId: request.id,
      metadata: { companyId: request.companyId, requestNumber: request.requestNumber },
    });

    if (recipientCompanyIds.length > 0) {
      await this.recordRecipientAudit(request.id, recipientCompanyIds, authenticatedActor.sub);
    }

    return request;
  }

  async list(actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    return this.prisma.request.findMany({
      where: this.buildScopeWhere(authenticatedActor),
      include: this.buildScopedInclude(authenticatedActor),
      orderBy: { createdAt: 'desc' },
    });
  }

  async listRecipientCompanies(actor?: AuthenticatedUser, regionId?: string) {
    const authenticatedActor = this.requireActor(actor);

    let regionIds: string[] | undefined;
    if (regionId) {
      const children = await this.prisma.region.findMany({
        where: { parentRegionId: regionId },
        select: { id: true },
      });
      regionIds = children.length > 0 ? [regionId, ...children.map((child) => child.id)] : [regionId];
    }

    return this.prisma.company.findMany({
      where: {
        companyType: CompanyType.GLASS_PRODUCER,
        status: CompanyStatus.ACTIVE,
        ...(regionIds ? { regionId: { in: regionIds } } : {}),
        memberships: {
          none: {
            userId: authenticatedActor.sub,
            status: CompanyMembershipStatus.ACTIVE,
          },
        },
      },
      select: { id: true, legalName: true, tradeName: true, regionId: true },
      orderBy: [{ tradeName: 'asc' }, { legalName: 'asc' }],
    });
  }

  async get(requestId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    return this.getScopedRequest(requestId, authenticatedActor);
  }

  async update(requestId: string, input: UpdateRequestDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getOwnedRequest(requestId, authenticatedActor);

    if (existing.status !== RequestStatus.DRAFT) {
      throw new ConflictException('Only draft requests can be updated');
    }

    await this.assertRegionAccess(input.regionId, existing.company.regionId, authenticatedActor);
    this.assertBudgetRange(
      input.budgetMin ?? existing.budgetMin?.toNumber(),
      input.budgetMax ?? existing.budgetMax?.toNumber(),
    );

    const result = await this.prisma.request.updateMany({
      where: { id: requestId, version: input.version, status: RequestStatus.DRAFT },
      data: {
        regionId: input.regionId,
        title: input.title?.trim(),
        description: input.description,
        productType: input.productType?.trim(),
        quantity: input.quantity,
        unit: input.unit,
        targetDeliveryDate: input.targetDeliveryDate ? new Date(input.targetDeliveryDate) : undefined,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        currency: input.currency,
        version: { increment: 1 },
      },
    });

    this.assertVersionUpdated(result.count);
    const updated = await this.getOwnedRequest(requestId, authenticatedActor);

    await this.auditService.record({
      actorId: authenticatedActor.sub,
      action: 'UPDATE',
      resource: 'request',
      resourceId: requestId,
      metadata: { version: updated.version },
    });

    return updated;
  }

  async submit(requestId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getOwnedRequest(requestId, authenticatedActor);

    if (existing.status !== RequestStatus.DRAFT) {
      throw new ConflictException('Only draft requests can be submitted');
    }
    if (existing.recipients.length === 0) {
      throw new BadRequestException('At least one recipient company is required');
    }

    const result = await this.prisma.request.updateMany({
      where: { id: requestId, version, status: RequestStatus.DRAFT },
      data: {
        status: RequestStatus.OPEN_FOR_QUOTATION,
        version: { increment: 1 },
      },
    });

    this.assertVersionUpdated(result.count);
    const submitted = await this.getOwnedRequest(requestId, authenticatedActor);

    await this.auditService.record({
      actorId: authenticatedActor.sub,
      action: 'SUBMIT',
      resource: 'request',
      resourceId: requestId,
      metadata: {
        fromStatus: RequestStatus.DRAFT,
        toStatus: RequestStatus.OPEN_FOR_QUOTATION,
        version: submitted.version,
      },
    });

    await Promise.all(
      submitted.recipients.map((recipient) => this.notificationsService.notifyCompany(recipient.companyId, {
        type: 'REQUEST_ASSIGNED',
        title: `Yeni talep: ${submitted.title}`,
        body: `${submitted.requestNumber} numarali talep firmaniza yonlendirildi.`,
        payload: { requestId: submitted.id, requestNumber: submitted.requestNumber },
      })),
    );

    return submitted;
  }

  async cancel(requestId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getOwnedRequest(requestId, authenticatedActor);
    const cancellableStatuses = new Set<RequestStatus>([
      RequestStatus.DRAFT,
      RequestStatus.OPEN_FOR_QUOTATION,
      RequestStatus.QUOTED,
    ]);

    if (!cancellableStatuses.has(existing.status)) {
      throw new ConflictException('Request cannot be cancelled from its current status');
    }

    const result = await this.prisma.request.updateMany({
      where: { id: requestId, version, status: { in: [...cancellableStatuses] } },
      data: { status: RequestStatus.CANCELLED, version: { increment: 1 } },
    });

    this.assertVersionUpdated(result.count);
    const cancelled = await this.getOwnedRequest(requestId, authenticatedActor);

    await this.auditService.record({
      actorId: authenticatedActor.sub,
      action: 'CANCEL',
      resource: 'request',
      resourceId: requestId,
      metadata: {
        fromStatus: existing.status,
        toStatus: RequestStatus.CANCELLED,
        version: cancelled.version,
      },
    });

    return cancelled;
  }

  async listRecipients(requestId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getOwnedRequest(requestId, authenticatedActor);

    return this.prisma.requestRecipient.findMany({
      where: { requestId },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async replaceRecipients(
    requestId: string,
    input: ReplaceRequestRecipientsDto,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getOwnedRequest(requestId, authenticatedActor);

    if (existing.status !== RequestStatus.DRAFT) {
      throw new ConflictException('Recipients can only be changed while the request is a draft');
    }

    const companyIds = await this.validateRecipientCompanies(existing.companyId, input.companyIds);

    const request = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.request.updateMany({
        where: { id: requestId, version: input.version, status: RequestStatus.DRAFT },
        data: { version: { increment: 1 } },
      });
      this.assertVersionUpdated(result.count);

      await transaction.requestRecipient.deleteMany({ where: { requestId } });
      if (companyIds.length > 0) {
        await transaction.requestRecipient.createMany({
          data: companyIds.map((companyId) => ({ requestId, companyId })),
        });
      }

      return transaction.request.findUniqueOrThrow({
        where: { id: requestId },
        include: this.ownerInclude,
      });
    });

    await this.recordRecipientAudit(requestId, companyIds, authenticatedActor.sub);
    return request;
  }

  private readonly ownerInclude = {
    company: true,
    region: true,
    createdBy: { select: { id: true, fullName: true, email: true } },
    recipients: { include: { company: true }, orderBy: { createdAt: 'asc' as const } },
  } satisfies Prisma.RequestInclude;

  private buildScopedInclude(actor: AuthenticatedUser): Prisma.RequestInclude {
    if (this.canManageScope(actor)) {
      return this.ownerInclude;
    }

    return {
      company: true,
      region: true,
      createdBy: { select: { id: true, fullName: true, email: true } },
      recipients: {
        where: {
          company: {
            memberships: {
              some: {
                userId: actor.sub,
                status: CompanyMembershipStatus.ACTIVE,
              },
            },
          },
        },
        include: { company: true },
        orderBy: { createdAt: 'asc' },
      },
    };
  }

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.RequestWhereInput {
    if (this.canManageScope(actor)) {
      return {};
    }

    const activeMembership = {
      some: {
        userId: actor.sub,
        status: CompanyMembershipStatus.ACTIVE,
      },
    };

    return {
      OR: [
        { company: { memberships: activeMembership } },
        {
          status: { not: RequestStatus.DRAFT },
          recipients: {
            some: { company: { memberships: activeMembership } },
          },
        },
      ],
    };
  }

  private async getScopedRequest(requestId: string, actor: AuthenticatedUser) {
    const request = await this.prisma.request.findFirst({
      where: { id: requestId, ...this.buildScopeWhere(actor) },
      include: this.buildScopedInclude(actor),
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }

  private async getOwnedRequest(requestId: string, actor: AuthenticatedUser) {
    const ownerWhere: Prisma.RequestWhereInput = this.canManageScope(actor)
      ? { id: requestId }
      : {
          id: requestId,
          company: {
            memberships: {
              some: {
                userId: actor.sub,
                status: CompanyMembershipStatus.ACTIVE,
              },
            },
          },
        };

    const request = await this.prisma.request.findFirst({
      where: ownerWhere,
      include: this.ownerInclude,
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }

  private async assertActiveCompanyMembership(companyId: string, actor: AuthenticatedUser) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        status: CompanyStatus.ACTIVE,
        ...(this.canManageScope(actor)
          ? {}
          : {
              memberships: {
                some: {
                  userId: actor.sub,
                  status: CompanyMembershipStatus.ACTIVE,
                },
              },
            }),
      },
      select: { id: true, regionId: true },
    });

    if (!company) {
      throw new ForbiddenException('You do not have access to an active company');
    }

    return company;
  }

  private async assertRegionAccess(
    regionId: string | null | undefined,
    companyRegionId: string | null,
    actor: AuthenticatedUser,
  ): Promise<void> {
    void companyRegionId;
    void actor;

    if (regionId === undefined || regionId === null) {
      return;
    }

    const region = await this.prisma.region.findFirst({
      where: { id: regionId, status: RegionStatus.ACTIVE },
      select: { id: true },
    });

    if (!region) {
      throw new BadRequestException('Active region not found');
    }
  }

  private async validateRecipientCompanies(ownerCompanyId: string, companyIds: string[]): Promise<string[]> {
    const uniqueCompanyIds = [...new Set(companyIds)];

    if (uniqueCompanyIds.length !== companyIds.length) {
      throw new ConflictException('Recipient companies must be unique');
    }
    if (uniqueCompanyIds.includes(ownerCompanyId)) {
      throw new BadRequestException('Request owner company cannot be a recipient');
    }
    if (uniqueCompanyIds.length === 0) {
      return uniqueCompanyIds;
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: uniqueCompanyIds }, status: CompanyStatus.ACTIVE },
      select: { id: true },
    });

    if (companies.length !== uniqueCompanyIds.length) {
      throw new BadRequestException('Every recipient company must exist and be active');
    }

    return uniqueCompanyIds;
  }

  private assertBudgetRange(budgetMin?: number, budgetMax?: number): void {
    if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
      throw new BadRequestException('budgetMin cannot be greater than budgetMax');
    }
  }

  private assertVersionUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException('Request was modified by another operation');
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

  private createRequestNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `REQ-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async recordRecipientAudit(requestId: string, companyIds: string[], actorId: string): Promise<void> {
    await this.auditService.record({
      actorId,
      action: 'RECIPIENTS_UPDATE',
      resource: 'request',
      resourceId: requestId,
      metadata: { companyIds },
    });
  }
}
