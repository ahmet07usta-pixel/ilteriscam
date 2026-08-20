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
  ProductionStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateProductionDto } from './dto/create-production.dto';
import { TransitionProductionDto } from './dto/transition-production.dto';

const ALLOWED_TRANSITIONS: Record<ProductionStatus, readonly ProductionStatus[]> = {
  [ProductionStatus.PLANNED]: [ProductionStatus.IN_PROGRESS, ProductionStatus.CANCELLED],
  [ProductionStatus.IN_PROGRESS]: [
    ProductionStatus.ON_HOLD,
    ProductionStatus.COMPLETED,
    ProductionStatus.CANCELLED,
  ],
  [ProductionStatus.ON_HOLD]: [ProductionStatus.IN_PROGRESS, ProductionStatus.CANCELLED],
  [ProductionStatus.COMPLETED]: [],
  [ProductionStatus.CANCELLED]: [],
};

@Injectable()
export class ProductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    return this.prisma.production.findMany({
      where: this.buildScopeWhere(authenticatedActor),
      include: this.productionInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(productionId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const production = await this.prisma.production.findFirst({
      where: { id: productionId, ...this.buildScopeWhere(authenticatedActor) },
      include: this.productionInclude,
    });

    if (!production) {
      throw new NotFoundException('Production not found');
    }

    return production;
  }

  async create(orderId: string, input: CreateProductionDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const plannedStartDate = input.plannedStartDate ? new Date(input.plannedStartDate) : null;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const order = await transaction.order.findFirst({
          where: {
            id: orderId,
            status: OrderStatus.CONFIRMED,
            version: input.orderVersion,
          },
          select: {
            id: true,
            orderNumber: true,
            manufacturerCompanyId: true,
            promisedDeliveryDate: true,
          },
        });

        if (!order) {
          throw new ConflictException('Order is not confirmed or was modified by another operation');
        }

        await this.assertManufacturerScope(
          order.manufacturerCompanyId,
          authenticatedActor,
          transaction,
        );

        const dueDate = input.dueDate ? new Date(input.dueDate) : order.promisedDeliveryDate;
        if (plannedStartDate && dueDate && dueDate < plannedStartDate) {
          throw new ConflictException('Production due date cannot be before its planned start date');
        }

        const production = await transaction.production.create({
          data: {
            productionNumber: `PRD-${order.orderNumber}`,
            orderId: order.id,
            manufacturerCompanyId: order.manufacturerCompanyId,
            createdByUserId: authenticatedActor.sub,
            productionLine: input.productionLine,
            plannedStartDate,
            dueDate,
            notes: input.notes,
          },
          include: this.productionInclude,
        });

        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'CREATE',
          resource: 'production',
          resourceId: production.id,
          metadata: {
            productionId: production.id,
            orderId: order.id,
            manufacturerCompanyId: order.manufacturerCompanyId,
            status: ProductionStatus.PLANNED,
            version: production.version,
          },
        }, transaction);

        return production;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowMutationConflict(error, 'Production already exists or the order was modified');
    }
  }

  async transition(
    productionId: string,
    input: TransitionProductionDto,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.prisma.production.findUnique({
      where: { id: productionId },
      include: this.productionInclude,
    });

    if (!existing) {
      throw new NotFoundException('Production not found');
    }

    await this.assertManufacturerScope(existing.manufacturerCompanyId, authenticatedActor);
    this.assertTransition(existing.status, input.toStatus, input.reason);

    const now = new Date();
    const lifecycleData: Prisma.ProductionUncheckedUpdateManyInput = {
      status: input.toStatus,
      statusReason: input.reason ?? null,
      version: { increment: 1 },
    };
    if (input.toStatus === ProductionStatus.IN_PROGRESS && !existing.startedAt) {
      lifecycleData.startedAt = now;
    }
    if (input.toStatus === ProductionStatus.COMPLETED) {
      lifecycleData.completedAt = now;
    }

    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const result = await transaction.production.updateMany({
          where: {
            id: existing.id,
            manufacturerCompanyId: existing.manufacturerCompanyId,
            status: existing.status,
            version: input.version,
          },
          data: lifecycleData,
        });

        if (result.count !== 1) {
          throw new ConflictException('Production was modified by another operation');
        }

        const transitioned = await transaction.production.findUniqueOrThrow({
          where: { id: existing.id },
          include: this.productionInclude,
        });

        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'STATUS_TRANSITION',
          resource: 'production',
          resourceId: existing.id,
          metadata: {
            productionId: existing.id,
            orderId: existing.orderId,
            manufacturerCompanyId: existing.manufacturerCompanyId,
            fromStatus: existing.status,
            toStatus: input.toStatus,
            version: transitioned.version,
            ...(input.reason ? { reason: input.reason } : {}),
          },
        }, transaction);

        return transitioned;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (input.toStatus === ProductionStatus.COMPLETED) {
        await this.notificationsService.notifyCompany(updated.order.companyId, {
          type: 'PRODUCTION_COMPLETED',
          title: `Uretiminiz tamamlandi: ${updated.order.request.title}`,
          body: `${updated.productionNumber} numarali uretim tamamlandi, sevkiyat hazirlanacak.`,
          payload: { productionId: updated.id, orderId: updated.orderId },
        });
      }

      return updated;
    } catch (error) {
      this.rethrowMutationConflict(error, 'Production was modified by another operation');
    }
  }

  private readonly productionInclude = {
    order: {
      include: {
        request: {
          select: {
            id: true,
            requestNumber: true,
            title: true,
            productType: true,
            companyId: true,
          },
        },
        quotation: { select: { id: true, quotationNumber: true } },
        company: true,
        manufacturerCompany: true,
      },
    },
    manufacturerCompany: true,
    createdBy: { select: { id: true, fullName: true, email: true } },
  } satisfies Prisma.ProductionInclude;

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.ProductionWhereInput {
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
        {
          order: {
            company: {
              status: CompanyStatus.ACTIVE,
              memberships: activeMembership,
            },
          },
        },
        {
          manufacturerCompany: {
            status: CompanyStatus.ACTIVE,
            memberships: activeMembership,
          },
        },
      ],
    };
  }

  private assertTransition(
    fromStatus: ProductionStatus,
    toStatus: ProductionStatus,
    reason?: string,
  ): void {
    if (!ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
      throw new ConflictException(`Production cannot transition from ${fromStatus} to ${toStatus}`);
    }
    if (
      (toStatus === ProductionStatus.ON_HOLD || toStatus === ProductionStatus.CANCELLED)
      && !reason
    ) {
      throw new ConflictException(`A reason is required when production becomes ${toStatus}`);
    }
  }

  private async assertManufacturerScope(
    companyId: string,
    actor: AuthenticatedUser,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (this.canManageScope(actor)) {
      return;
    }
    if (actor.role !== Role.PRODUCER) {
      throw new ForbiddenException('Only the manufacturer can manage production');
    }

    const company = await client.company.findFirst({
      where: {
        id: companyId,
        status: CompanyStatus.ACTIVE,
        memberships: {
          some: {
            userId: actor.sub,
            status: CompanyMembershipStatus.ACTIVE,
          },
        },
      },
      select: { id: true },
    });

    if (!company) {
      throw new ForbiddenException('Active manufacturer company membership is required');
    }
  }

  private rethrowMutationConflict(error: unknown, message: string): never {
    if (error instanceof ConflictException) {
      throw error;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === 'P2002' || error.code === 'P2034')
    ) {
      throw new ConflictException(message);
    }
    throw error;
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
