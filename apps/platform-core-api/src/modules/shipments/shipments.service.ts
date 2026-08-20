import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyMembershipStatus,
  CompanyStatus,
  Prisma,
  ProductionStatus,
  Role,
  ShipmentStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { TransitionShipmentDto } from './dto/transition-shipment.dto';

const ALLOWED_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  [ShipmentStatus.PLANNED]: [ShipmentStatus.IN_TRANSIT],
  [ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.DELIVERED],
  [ShipmentStatus.DELIVERED]: [],
};

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    return this.prisma.shipment.findMany({
      where: this.buildScopeWhere(authenticatedActor),
      include: this.shipmentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(shipmentId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, ...this.buildScopeWhere(authenticatedActor) },
      include: this.shipmentInclude,
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    return shipment;
  }

  async create(
    productionId: string,
    input: CreateShipmentDto,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);
    const plannedDepartureAt = new Date(input.plannedDepartureAt);
    const estimatedDeliveryAt = new Date(input.estimatedDeliveryAt);

    if (estimatedDeliveryAt < plannedDepartureAt) {
      throw new ConflictException('Shipment delivery estimate cannot be before departure');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const production = await transaction.production.findFirst({
          where: {
            id: productionId,
            status: ProductionStatus.COMPLETED,
            version: input.productionVersion,
          },
          select: {
            id: true,
            productionNumber: true,
            orderId: true,
            manufacturerCompanyId: true,
          },
        });

        if (!production) {
          throw new ConflictException('Production is not completed or was modified by another operation');
        }

        await this.assertManufacturerScope(
          production.manufacturerCompanyId,
          authenticatedActor,
          transaction,
        );

        const shipment = await transaction.shipment.create({
          data: {
            shipmentNumber: `SHP-${production.productionNumber}`,
            productionId: production.id,
            orderId: production.orderId,
            manufacturerCompanyId: production.manufacturerCompanyId,
            createdByUserId: authenticatedActor.sub,
            destinationAddress: input.destinationAddress,
            plannedDepartureAt,
            estimatedDeliveryAt,
            carrier: input.carrier,
            trackingNumber: input.trackingNumber,
            notes: input.notes,
          },
          include: this.shipmentInclude,
        });

        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'CREATE',
          resource: 'shipment',
          resourceId: shipment.id,
          metadata: {
            shipmentId: shipment.id,
            productionId: production.id,
            orderId: production.orderId,
            manufacturerCompanyId: production.manufacturerCompanyId,
            status: ShipmentStatus.PLANNED,
            version: shipment.version,
          },
        }, transaction);

        return shipment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowMutationConflict(error, 'Shipment already exists or the production was modified');
    }
  }

  async transition(
    shipmentId: string,
    input: TransitionShipmentDto,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: this.shipmentInclude,
    });

    if (!existing) {
      throw new NotFoundException('Shipment not found');
    }

    await this.assertManufacturerScope(existing.manufacturerCompanyId, authenticatedActor);
    this.assertTransition(existing.status, input.toStatus);

    const lifecycleData: Prisma.ShipmentUncheckedUpdateManyInput = {
      status: input.toStatus,
      version: { increment: 1 },
    };
    const now = new Date();
    if (input.toStatus === ShipmentStatus.IN_TRANSIT && !existing.departedAt) {
      lifecycleData.departedAt = now;
    }
    if (input.toStatus === ShipmentStatus.DELIVERED) {
      lifecycleData.deliveredAt = now;
    }

    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const result = await transaction.shipment.updateMany({
          where: {
            id: existing.id,
            manufacturerCompanyId: existing.manufacturerCompanyId,
            status: existing.status,
            version: input.version,
          },
          data: lifecycleData,
        });

        if (result.count !== 1) {
          throw new ConflictException('Shipment was modified by another operation');
        }

        const transitioned = await transaction.shipment.findUniqueOrThrow({
          where: { id: existing.id },
          include: this.shipmentInclude,
        });

        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'STATUS_TRANSITION',
          resource: 'shipment',
          resourceId: existing.id,
          metadata: {
            shipmentId: existing.id,
            productionId: existing.productionId,
            orderId: existing.orderId,
            manufacturerCompanyId: existing.manufacturerCompanyId,
            fromStatus: existing.status,
            toStatus: input.toStatus,
            version: transitioned.version,
          },
        }, transaction);

        return transitioned;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (input.toStatus === ShipmentStatus.IN_TRANSIT) {
        await this.notificationsService.notifyCompany(updated.order.companyId, {
          type: 'SHIPMENT_IN_TRANSIT',
          title: `Siparisiniz yola cikti: ${updated.order.request.title}`,
          body: `${updated.shipmentNumber} numarali sevkiyat yola cikti.`,
          payload: { shipmentId: updated.id, orderId: updated.orderId },
        });
      }
      if (input.toStatus === ShipmentStatus.DELIVERED) {
        await this.notificationsService.notifyCompany(updated.order.companyId, {
          type: 'SHIPMENT_DELIVERED',
          title: `Siparisiniz teslim edildi: ${updated.order.request.title}`,
          body: `${updated.shipmentNumber} numarali sevkiyat teslim edildi.`,
          payload: { shipmentId: updated.id, orderId: updated.orderId },
        });
      }

      return updated;
    } catch (error) {
      this.rethrowMutationConflict(error, 'Shipment was modified by another operation');
    }
  }

  private readonly shipmentInclude = {
    production: {
      select: {
        id: true,
        productionNumber: true,
        status: true,
        version: true,
        completedAt: true,
      },
    },
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
  } satisfies Prisma.ShipmentInclude;

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.ShipmentWhereInput {
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

  private assertTransition(fromStatus: ShipmentStatus, toStatus: ShipmentStatus): void {
    if (!ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
      throw new ConflictException(`Shipment cannot transition from ${fromStatus} to ${toStatus}`);
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
      throw new ForbiddenException('Only the manufacturer can manage shipments');
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