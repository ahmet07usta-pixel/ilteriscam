import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyMembershipStatus,
  CompanyStatus,
  OrderStatus,
  Prisma,
  QuotationStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PERMISSIONS } from '../rbac/permissions';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    return this.prisma.order.findMany({
      where: this.buildScopeWhere(authenticatedActor),
      include: this.orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(orderId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...this.buildScopeWhere(authenticatedActor) },
      include: this.orderInclude,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async confirm(orderId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getOrderForTransition(orderId);

    this.assertPending(existing.status);
    this.assertPartyIntegrity(existing);
    await this.assertManufacturerScope(existing.manufacturerCompanyId, authenticatedActor);

    const confirmed = await this.transition(
      existing,
      version,
      OrderStatus.CONFIRMED,
      authenticatedActor,
      {
        confirmedAt: new Date(),
        confirmedByUserId: authenticatedActor.sub,
      },
      'CONFIRM',
    );

    await this.notificationsService.notifyCompany(confirmed.companyId, {
      type: 'ORDER_CONFIRMED',
      title: `Siparisiniz onaylandi: ${confirmed.orderNumber}`,
      body: `${confirmed.orderNumber} numarali siparisiniz uretici tarafindan onaylandi.`,
      payload: { orderId: confirmed.id, requestId: confirmed.requestId },
    });

    return confirmed;
  }

  async cancel(
    orderId: string,
    version: number,
    cancellationReason: string | undefined,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.getOrderForTransition(orderId);

    this.assertPending(existing.status);
    this.assertPartyIntegrity(existing);
    await this.assertBuyerScope(existing.companyId, authenticatedActor);

    const cancelled = await this.transition(
      existing,
      version,
      OrderStatus.CANCELLED,
      authenticatedActor,
      {
        cancelledAt: new Date(),
        cancelledByUserId: authenticatedActor.sub,
        cancellationReason,
      },
      'CANCEL',
      cancellationReason,
    );

    await this.notificationsService.notifyCompany(cancelled.manufacturerCompanyId, {
      type: 'ORDER_CANCELLED',
      title: `Siparis iptal edildi: ${cancelled.orderNumber}`,
      body: `${cancelled.orderNumber} numarali siparis alici tarafindan iptal edildi.`,
      payload: { orderId: cancelled.id, requestId: cancelled.requestId },
    });

    return cancelled;
  }

  private readonly orderInclude = {
    request: { select: { id: true, requestNumber: true, companyId: true, status: true } },
    quotation: {
      select: {
        id: true,
        quotationNumber: true,
        requestId: true,
        companyId: true,
        manufacturerCompanyId: true,
        status: true,
      },
    },
    company: true,
    manufacturerCompany: true,
    createdBy: { select: { id: true, fullName: true, email: true } },
    confirmedBy: { select: { id: true, fullName: true, email: true } },
    cancelledBy: { select: { id: true, fullName: true, email: true } },
  } satisfies Prisma.OrderInclude;

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.OrderWhereInput {
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
        { company: { status: CompanyStatus.ACTIVE, memberships: activeMembership } },
        {
          manufacturerCompany: {
            status: CompanyStatus.ACTIVE,
            memberships: activeMembership,
          },
        },
      ],
    };
  }

  private async getOrderForTransition(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderInclude,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private assertPending(status: OrderStatus): void {
    if (status !== OrderStatus.PENDING_CONFIRMATION) {
      throw new ConflictException('Order is no longer pending confirmation');
    }
  }

  private assertPartyIntegrity(order: Awaited<ReturnType<OrdersService['getOrderForTransition']>>): void {
    if (
      order.request.companyId !== order.companyId
      || order.quotation.requestId !== order.requestId
      || order.quotation.companyId !== order.companyId
      || order.quotation.manufacturerCompanyId !== order.manufacturerCompanyId
      || order.quotation.status !== QuotationStatus.ACCEPTED
    ) {
      throw new ConflictException('Order party relationships are inconsistent');
    }
  }

  private async assertManufacturerScope(companyId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role !== Role.PRODUCER) {
      throw new ForbiddenException('Only the manufacturer can confirm this order');
    }

    await this.assertActiveMembership(companyId, actor.sub, 'manufacturer');
  }

  private async assertBuyerScope(companyId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === Role.PRODUCER) {
      throw new ForbiddenException('Manufacturers cannot cancel orders');
    }
    if (this.canManageScope(actor)) {
      return;
    }

    await this.assertActiveMembership(companyId, actor.sub, 'buyer');
  }

  private async assertActiveMembership(
    companyId: string,
    userId: string,
    party: 'buyer' | 'manufacturer',
  ): Promise<void> {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        status: CompanyStatus.ACTIVE,
        memberships: {
          some: {
            userId,
            status: CompanyMembershipStatus.ACTIVE,
          },
        },
      },
      select: { id: true },
    });

    if (!company) {
      throw new ForbiddenException(`Active ${party} company membership is required`);
    }
  }

  private async transition(
    existing: Awaited<ReturnType<OrdersService['getOrderForTransition']>>,
    version: number,
    toStatus: OrderStatus,
    actor: AuthenticatedUser,
    data: Prisma.OrderUncheckedUpdateManyInput,
    action: 'CONFIRM' | 'CANCEL',
    cancellationReason?: string,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const result = await transaction.order.updateMany({
          where: {
            id: existing.id,
            status: OrderStatus.PENDING_CONFIRMATION,
            version,
          },
          data: {
            ...data,
            status: toStatus,
            version: { increment: 1 },
          },
        });

        if (result.count !== 1) {
          throw new ConflictException('Order was modified by another operation');
        }

        const updated = await transaction.order.findUniqueOrThrow({
          where: { id: existing.id },
          include: this.orderInclude,
        });

        await this.auditService.record({
          actorId: actor.sub,
          action,
          resource: 'order',
          resourceId: existing.id,
          metadata: {
            orderId: existing.id,
            requestId: existing.requestId,
            quotationId: existing.quotationId,
            fromStatus: OrderStatus.PENDING_CONFIRMATION,
            toStatus,
            version: updated.version,
            ...(cancellationReason ? { reason: cancellationReason } : {}),
          },
        }, transaction);

        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034')) {
        throw new ConflictException('Order was modified by another operation');
      }
      throw error;
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
}