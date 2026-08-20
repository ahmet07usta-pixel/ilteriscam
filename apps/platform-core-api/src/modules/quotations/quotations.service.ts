import { randomUUID } from 'node:crypto';

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
  OrderStatus,
  Prisma,
  QuotationStatus,
  RequestStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(requestId: string, input: CreateQuotationDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const request = await this.getRequestForQuotation(requestId);

    if (!this.openRequestStatuses.has(request.status)) {
      throw new ConflictException('Request is not open for quotations');
    }

    await this.assertManufacturerRecipientAccess(
      requestId,
      input.manufacturerCompanyId,
      authenticatedActor,
    );
    this.assertValidUntil(input.validUntil);

    const existing = await this.prisma.quotation.findUnique({
      where: {
        requestId_manufacturerCompanyId: {
          requestId,
          manufacturerCompanyId: input.manufacturerCompanyId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Manufacturer already has a quotation for this request');
    }

    let quotation;
    try {
      quotation = await this.prisma.quotation.create({
        data: {
          quotationNumber: this.createQuotationNumber(),
          requestId,
          companyId: request.companyId,
          manufacturerCompanyId: input.manufacturerCompanyId,
          createdByUserId: authenticatedActor.sub,
          totalAmount: input.totalAmount,
          currency: input.currency ?? request.currency,
          leadTimeDays: input.leadTimeDays,
          validUntil: new Date(input.validUntil),
          notes: input.notes,
          status: QuotationStatus.DRAFT,
          revisionNumber: 1,
          version: 1,
        },
        include: this.quotationInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Manufacturer already has a quotation for this request');
      }
      throw error;
    }

    await this.auditService.record({
      actorId: authenticatedActor.sub,
      action: 'CREATE',
      resource: 'quotation',
      resourceId: quotation.id,
      metadata: {
        requestId,
        companyId: request.companyId,
        manufacturerCompanyId: input.manufacturerCompanyId,
        quotationNumber: quotation.quotationNumber,
        revisionNumber: quotation.revisionNumber,
      },
    });

    return quotation;
  }

  async list(actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    return this.prisma.quotation.findMany({
      where: this.buildScopeWhere(authenticatedActor),
      include: this.quotationInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForRequest(requestId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.assertRequestVisible(requestId, authenticatedActor);

    return this.prisma.quotation.findMany({
      where: {
        requestId,
        ...this.buildScopeWhere(authenticatedActor),
      },
      include: this.quotationInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(quotationId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    return this.getScopedQuotation(quotationId, authenticatedActor);
  }

  async update(quotationId: string, input: UpdateQuotationDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getManufacturerQuotation(quotationId, authenticatedActor);

    if (existing.status !== QuotationStatus.DRAFT) {
      throw new ConflictException('Only draft quotations can be updated');
    }
    if (input.validUntil !== undefined) {
      this.assertValidUntil(input.validUntil);
    }
    if (
      existing.activeCalculationId
      && (input.totalAmount !== undefined || input.currency !== undefined)
    ) {
      throw new ConflictException('Finalize a new calculation before changing quotation amount or currency');
    }

    const result = await this.prisma.quotation.updateMany({
      where: {
        id: quotationId,
        manufacturerCompanyId: existing.manufacturerCompanyId,
        version: input.version,
        status: QuotationStatus.DRAFT,
      },
      data: {
        totalAmount: input.totalAmount,
        currency: input.currency,
        leadTimeDays: input.leadTimeDays,
        validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        notes: input.notes,
        version: { increment: 1 },
      },
    });

    this.assertVersionUpdated(result.count);
    const updated = await this.getManufacturerQuotation(quotationId, authenticatedActor);

    await this.recordAudit('UPDATE', updated, authenticatedActor.sub, {
      version: updated.version,
      revisionNumber: updated.revisionNumber,
    });

    return updated;
  }

  async send(quotationId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getManufacturerQuotation(quotationId, authenticatedActor);

    if (existing.status !== QuotationStatus.DRAFT) {
      throw new ConflictException('Only draft quotations can be sent');
    }
    if (existing.validUntil.getTime() <= Date.now()) {
      throw new ConflictException('Expired quotation cannot be sent');
    }
    if (!this.openRequestStatuses.has(existing.request.status)) {
      throw new ConflictException('Request is not open for quotations');
    }

    const requestTransitioned = await this.prisma.$transaction(async (transaction) => {
      await this.assertActiveCalculationMatchesRevision(existing, transaction);

      const result = await transaction.quotation.updateMany({
        where: {
          id: quotationId,
          manufacturerCompanyId: existing.manufacturerCompanyId,
          version,
          status: QuotationStatus.DRAFT,
        },
        data: { status: QuotationStatus.SENT, version: { increment: 1 } },
      });
      this.assertVersionUpdated(result.count);

      const requestResult = await transaction.request.updateMany({
        where: { id: existing.requestId, status: RequestStatus.OPEN_FOR_QUOTATION },
        data: { status: RequestStatus.QUOTED, version: { increment: 1 } },
      });

      return requestResult.count === 1;
    });

    const sent = await this.getManufacturerQuotation(quotationId, authenticatedActor);
    await this.recordAudit('SEND', sent, authenticatedActor.sub, {
      fromStatus: QuotationStatus.DRAFT,
      toStatus: QuotationStatus.SENT,
      revisionNumber: sent.revisionNumber,
      version: sent.version,
    });

    if (requestTransitioned) {
      await this.auditService.record({
        actorId: authenticatedActor.sub,
        action: 'STATUS_CHANGE',
        resource: 'request',
        resourceId: existing.requestId,
        metadata: {
          fromStatus: RequestStatus.OPEN_FOR_QUOTATION,
          toStatus: RequestStatus.QUOTED,
          quotationId,
        },
      });
    }

    await this.notificationsService.notifyCompany(sent.companyId, {
      type: 'QUOTATION_RECEIVED',
      title: `Yeni teklif: ${sent.request.title}`,
      body: `${sent.quotationNumber} numarali teklif gonderildi.`,
      payload: { quotationId: sent.id, requestId: sent.requestId },
    });

    return sent;
  }

  async revise(quotationId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getManufacturerQuotation(quotationId, authenticatedActor);

    if (existing.status !== QuotationStatus.SENT) {
      throw new ConflictException('Only sent quotations can be revised');
    }
    if (!this.openRequestStatuses.has(existing.request.status)) {
      throw new ConflictException('Request is not open for quotation revisions');
    }

    const result = await this.prisma.quotation.updateMany({
      where: {
        id: quotationId,
        manufacturerCompanyId: existing.manufacturerCompanyId,
        version,
        status: QuotationStatus.SENT,
      },
      data: {
        status: QuotationStatus.DRAFT,
        activeCalculationId: null,
        revisionNumber: { increment: 1 },
        version: { increment: 1 },
      },
    });

    this.assertVersionUpdated(result.count);
    const revised = await this.getManufacturerQuotation(quotationId, authenticatedActor);

    await this.recordAudit('REVISE', revised, authenticatedActor.sub, {
      fromStatus: QuotationStatus.SENT,
      toStatus: QuotationStatus.DRAFT,
      revisionNumber: revised.revisionNumber,
      version: revised.version,
    });

    return revised;
  }

  async withdraw(quotationId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getManufacturerQuotation(quotationId, authenticatedActor);
    const withdrawableStatuses = new Set<QuotationStatus>([
      QuotationStatus.DRAFT,
      QuotationStatus.SENT,
    ]);

    if (!withdrawableStatuses.has(existing.status)) {
      throw new ConflictException('Quotation cannot be withdrawn from its current status');
    }

    const result = await this.prisma.quotation.updateMany({
      where: {
        id: quotationId,
        manufacturerCompanyId: existing.manufacturerCompanyId,
        version,
        status: { in: [...withdrawableStatuses] },
      },
      data: { status: QuotationStatus.WITHDRAWN, version: { increment: 1 } },
    });

    this.assertVersionUpdated(result.count);
    const withdrawn = await this.getManufacturerQuotation(quotationId, authenticatedActor);

    await this.recordAudit('WITHDRAW', withdrawn, authenticatedActor.sub, {
      fromStatus: existing.status,
      toStatus: QuotationStatus.WITHDRAWN,
      revisionNumber: withdrawn.revisionNumber,
      version: withdrawn.version,
    });

    return withdrawn;
  }

  async reject(quotationId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getBuyerQuotationForDecision(quotationId, authenticatedActor);

    if (existing.status !== QuotationStatus.SENT) {
      throw new ConflictException('Only sent quotations can be rejected');
    }
    if (existing.request.status !== RequestStatus.QUOTED) {
      throw new ConflictException('Request is not available for quotation rejection');
    }

    const result = await this.prisma.quotation.updateMany({
      where: {
        id: quotationId,
        requestId: existing.requestId,
        companyId: existing.companyId,
        manufacturerCompanyId: existing.manufacturerCompanyId,
        status: QuotationStatus.SENT,
        version,
      },
      data: { status: QuotationStatus.REJECTED, version: { increment: 1 } },
    });

    this.assertVersionUpdated(result.count);
    const rejected = await this.getBuyerQuotationForDecision(quotationId, authenticatedActor);

    await this.recordAudit('REJECT', rejected, authenticatedActor.sub, {
      requestId: rejected.requestId,
      fromStatus: QuotationStatus.SENT,
      toStatus: QuotationStatus.REJECTED,
      revisionNumber: rejected.revisionNumber,
      version: rejected.version,
      reason: 'BUYER_REJECTED',
    });

    await this.notificationsService.notifyCompany(rejected.manufacturerCompanyId, {
      type: 'QUOTATION_REJECTED',
      title: `Teklifiniz reddedildi: ${rejected.request.title}`,
      body: `${rejected.quotationNumber} numarali teklifiniz alici tarafindan reddedildi.`,
      payload: { quotationId: rejected.id, requestId: rejected.requestId },
    });

    return rejected;
  }

  async accept(quotationId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getBuyerQuotationForDecision(quotationId, authenticatedActor);

    if (existing.status !== QuotationStatus.SENT) {
      throw new ConflictException('Only sent quotations can be accepted');
    }
    if (existing.validUntil.getTime() <= Date.now()) {
      throw new ConflictException('Expired quotation cannot be accepted');
    }
    if (existing.request.status !== RequestStatus.QUOTED) {
      throw new ConflictException('Request is not available for quotation acceptance');
    }

    const now = new Date();
    const promisedDeliveryDate = new Date(now.getTime() + existing.leadTimeDays * 86_400_000);

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        await this.assertActiveCalculationMatchesRevision(existing, transaction);

        const requestResult = await transaction.request.updateMany({
          where: {
            id: existing.requestId,
            companyId: existing.companyId,
            status: RequestStatus.QUOTED,
            version: existing.request.version,
          },
          data: { status: RequestStatus.AWARDED, version: { increment: 1 } },
        });
        this.assertAcceptanceUpdated(requestResult.count);

        const quotationResult = await transaction.quotation.updateMany({
          where: {
            id: quotationId,
            requestId: existing.requestId,
            companyId: existing.companyId,
            manufacturerCompanyId: existing.manufacturerCompanyId,
            status: QuotationStatus.SENT,
            version,
            validUntil: { gt: now },
          },
          data: { status: QuotationStatus.ACCEPTED, version: { increment: 1 } },
        });
        this.assertAcceptanceUpdated(quotationResult.count);

        const competingQuotations = await transaction.quotation.findMany({
          where: {
            requestId: existing.requestId,
            id: { not: quotationId },
            status: QuotationStatus.SENT,
          },
          select: { id: true, revisionNumber: true, version: true },
        });

        if (competingQuotations.length > 0) {
          const rejectedResult = await transaction.quotation.updateMany({
            where: {
              id: { in: competingQuotations.map((quotation) => quotation.id) },
              status: QuotationStatus.SENT,
            },
            data: { status: QuotationStatus.REJECTED, version: { increment: 1 } },
          });
          if (rejectedResult.count !== competingQuotations.length) {
            throw new ConflictException('Competing quotations changed during acceptance');
          }
        }

        const order = await transaction.order.create({
          data: {
            orderNumber: this.createOrderNumber(),
            requestId: existing.requestId,
            quotationId: existing.id,
            companyId: existing.companyId,
            manufacturerCompanyId: existing.manufacturerCompanyId,
            createdByUserId: authenticatedActor.sub,
            status: OrderStatus.PENDING_CONFIRMATION,
            currency: existing.currency,
            totalAmount: existing.totalAmount,
            promisedDeliveryDate,
          },
        });

        const acceptedQuotation = await transaction.quotation.findUniqueOrThrow({
          where: { id: quotationId },
          include: this.quotationInclude,
        });

        await this.recordAudit('ACCEPT', acceptedQuotation, authenticatedActor.sub, {
          fromStatus: QuotationStatus.SENT,
          toStatus: QuotationStatus.ACCEPTED,
          revisionNumber: acceptedQuotation.revisionNumber,
          version: acceptedQuotation.version,
          orderId: order.id,
        }, transaction);

        for (const competingQuotation of competingQuotations) {
          await this.auditService.record({
            actorId: authenticatedActor.sub,
            action: 'REJECT',
            resource: 'quotation',
            resourceId: competingQuotation.id,
            metadata: {
              requestId: existing.requestId,
              acceptedQuotationId: quotationId,
              fromStatus: QuotationStatus.SENT,
              toStatus: QuotationStatus.REJECTED,
              revisionNumber: competingQuotation.revisionNumber,
              version: competingQuotation.version + 1,
              reason: 'OTHER_QUOTATION_ACCEPTED',
            },
          }, transaction);
        }

        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'STATUS_CHANGE',
          resource: 'request',
          resourceId: existing.requestId,
          metadata: {
            quotationId,
            orderId: order.id,
            fromStatus: RequestStatus.QUOTED,
            toStatus: RequestStatus.AWARDED,
            version: existing.request.version + 1,
          },
        }, transaction);

        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'CREATE',
          resource: 'order',
          resourceId: order.id,
          metadata: {
            requestId: existing.requestId,
            quotationId,
            companyId: existing.companyId,
            manufacturerCompanyId: existing.manufacturerCompanyId,
            fromStatus: null,
            toStatus: OrderStatus.PENDING_CONFIRMATION,
          },
        }, transaction);

        return { quotation: acceptedQuotation, order };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      await this.notificationsService.notifyCompany(existing.manufacturerCompanyId, {
        type: 'QUOTATION_ACCEPTED',
        title: `Teklifiniz kabul edildi: ${existing.request.title}`,
        body: `${result.quotation.quotationNumber} numarali teklifiniz kabul edildi, siparis olusturuldu.`,
        payload: { quotationId: result.quotation.id, orderId: result.order.id, requestId: existing.requestId },
      });

      return result;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034')) {
        throw new ConflictException('Quotation has already been accepted or ordered');
      }
      throw error;
    }
  }

  private readonly quotationInclude = {
    request: {
      select: {
        id: true,
        requestNumber: true,
        companyId: true,
        title: true,
        status: true,
      },
    },
    company: true,
    manufacturerCompany: true,
    createdBy: { select: { id: true, fullName: true, email: true } },
  } satisfies Prisma.QuotationInclude;

  private readonly openRequestStatuses = new Set<RequestStatus>([
    RequestStatus.OPEN_FOR_QUOTATION,
    RequestStatus.QUOTED,
  ]);

  private async assertActiveCalculationMatchesRevision(
    quotation: { id: string; activeCalculationId: string | null; revisionNumber: number },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (!quotation.activeCalculationId) {
      return;
    }

    const calculation = await transaction.quotationCalculation.findFirst({
      where: {
        id: quotation.activeCalculationId,
        quotationId: quotation.id,
        quotationRevisionNumber: quotation.revisionNumber,
        status: CalculationStatus.FINALIZED,
      },
      select: { id: true },
    });

    if (!calculation) {
      throw new ConflictException('Active calculation does not belong to the current quotation revision');
    }
  }

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.QuotationWhereInput {
    if (this.canManageScope(actor)) {
      return {};
    }

    return {
      OR: [
        {
          company: {
            memberships: {
              some: {
                userId: actor.sub,
                status: CompanyMembershipStatus.ACTIVE,
              },
            },
          },
        },
        {
          manufacturerCompany: {
            memberships: {
              some: {
                userId: actor.sub,
                status: CompanyMembershipStatus.ACTIVE,
              },
            },
          },
        },
      ],
    };
  }

  private async getScopedQuotation(quotationId: string, actor: AuthenticatedUser) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, ...this.buildScopeWhere(actor) },
      include: this.quotationInclude,
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    return quotation;
  }

  private async getManufacturerQuotation(quotationId: string, actor: AuthenticatedUser) {
    const quotation = await this.prisma.quotation.findFirst({
      where: {
        id: quotationId,
        manufacturerCompany: {
          status: CompanyStatus.ACTIVE,
          memberships: {
            some: {
              userId: actor.sub,
              status: CompanyMembershipStatus.ACTIVE,
            },
          },
        },
      },
      include: this.quotationInclude,
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    return quotation;
  }

  private async getBuyerQuotationForDecision(quotationId: string, actor: AuthenticatedUser) {
    if (actor.role === Role.PRODUCER) {
      throw new ForbiddenException('Manufacturers cannot decide on quotations');
    }

    const quotation = await this.prisma.quotation.findFirst({
      where: {
        id: quotationId,
        company: {
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
        manufacturerCompany: { status: CompanyStatus.ACTIVE },
      },
      include: {
        ...this.quotationInclude,
        request: {
          select: {
            id: true,
            requestNumber: true,
            companyId: true,
            title: true,
            status: true,
            version: true,
          },
        },
      },
    });

    if (!quotation || quotation.companyId !== quotation.request.companyId) {
      throw new NotFoundException('Quotation not found');
    }

    const recipient = await this.prisma.requestRecipient.findUnique({
      where: {
        requestId_companyId: {
          requestId: quotation.requestId,
          companyId: quotation.manufacturerCompanyId,
        },
      },
      select: { id: true },
    });

    if (!recipient) {
      throw new ConflictException('Quotation parties are no longer valid');
    }

    return quotation;
  }

  private async assertRequestVisible(requestId: string, actor: AuthenticatedUser): Promise<void> {
    if (this.canManageScope(actor)) {
      const request = await this.prisma.request.findUnique({
        where: { id: requestId },
        select: { id: true },
      });
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      return;
    }

    const request = await this.prisma.request.findFirst({
      where: {
        id: requestId,
        OR: [
          {
            company: {
              memberships: {
                some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE },
              },
            },
          },
          {
            status: { not: RequestStatus.DRAFT },
            recipients: {
              some: {
                company: {
                  memberships: {
                    some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }
  }

  private async getRequestForQuotation(requestId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, companyId: true, currency: true, status: true },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }

  private async assertManufacturerRecipientAccess(
    requestId: string,
    manufacturerCompanyId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const recipient = await this.prisma.requestRecipient.findFirst({
      where: {
        requestId,
        companyId: manufacturerCompanyId,
        company: {
          status: CompanyStatus.ACTIVE,
          memberships: {
            some: {
              userId: actor.sub,
              status: CompanyMembershipStatus.ACTIVE,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!recipient) {
      throw new ForbiddenException('Active manufacturer membership and request recipient access are required');
    }
  }

  private assertValidUntil(validUntil: string): void {
    if (new Date(validUntil).getTime() <= Date.now()) {
      throw new BadRequestException('validUntil must be in the future');
    }
  }

  private assertVersionUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException('Quotation was modified by another operation');
    }
  }

  private assertAcceptanceUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException('Quotation acceptance conflicts with another operation');
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

  private createQuotationNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `QUO-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private createOrderNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `ORD-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async recordAudit(
    action: string,
    quotation: {
      id: string;
      requestId: string;
      companyId: string;
      manufacturerCompanyId: string;
    },
    actorId: string,
    metadata: Prisma.InputJsonObject,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.auditService.record({
      actorId,
      action,
      resource: 'quotation',
      resourceId: quotation.id,
      metadata: {
        requestId: quotation.requestId,
        companyId: quotation.companyId,
        manufacturerCompanyId: quotation.manufacturerCompanyId,
        ...metadata,
      },
    }, client);
  }
}
