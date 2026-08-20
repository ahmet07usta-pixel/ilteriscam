import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyMembershipStatus,
  Prisma,
  RequestStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateRequestItemDto } from './dto/create-request-item.dto';
import { UpdateRequestItemDto } from './dto/update-request-item.dto';

type DatabaseClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RequestItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(requestId: string, input: CreateRequestItemDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const request = await this.getOwnedRequest(requestId, authenticatedActor, transaction);
          this.assertDraft(request.status, 'created');

          const lastItem = await transaction.requestItem.findFirst({
            where: { requestId },
            orderBy: { lineNumber: 'desc' },
            select: { lineNumber: true },
          });
          const changedFields = this.createChangedFields(input);
          const item = await transaction.requestItem.create({
            data: {
              requestId,
              lineNumber: (lastItem?.lineNumber ?? 0) + 1,
              description: input.description.trim(),
              productType: input.productType?.trim() || request.productType,
              productCode: input.productCode?.trim(),
              quantity: input.quantity,
              unit: input.unit,
              measurementSource: input.measurementSource,
              widthMm: input.width,
              heightMm: input.height,
              lengthMm: input.length,
              depthMm: input.depth,
              thicknessMm: input.thickness,
              createdByUserId: authenticatedActor.sub,
              updatedByUserId: authenticatedActor.sub,
            },
          });

          await this.auditService.record({
            actorId: authenticatedActor.sub,
            action: 'CREATE',
            resource: 'request_item',
            resourceId: item.id,
            metadata: {
              requestId,
              requestItemId: item.id,
              actorId: authenticatedActor.sub,
              version: item.version,
              changedFields,
            },
          }, transaction);

          return item;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (this.isRetryableCreateError(error)) {
          if (attempt < 3) {
            continue;
          }
          throw new ConflictException('Request item line number could not be allocated');
        }
        throw error;
      }
    }

    throw new ConflictException('Request item line number could not be allocated');
  }

  async list(requestId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedRequest(requestId, authenticatedActor);

    return this.prisma.requestItem.findMany({
      where: { requestId },
      orderBy: { lineNumber: 'asc' },
    });
  }

  async get(requestId: string, itemId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedRequest(requestId, authenticatedActor);
    return this.getRequestItem(requestId, itemId);
  }

  async update(
    requestId: string,
    itemId: string,
    input: UpdateRequestItemDto,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);
    const changedFields = this.updateChangedFields(input);

    return this.prisma.$transaction(async (transaction) => {
      const request = await this.getOwnedRequest(requestId, authenticatedActor, transaction);
      this.assertDraft(request.status, 'updated');
      await this.getRequestItem(requestId, itemId, transaction);

      const result = await transaction.requestItem.updateMany({
        where: { id: itemId, requestId, version: input.version },
        data: {
          description: input.description?.trim(),
          productType: input.productType?.trim(),
          productCode: input.productCode?.trim(),
          quantity: input.quantity,
          unit: input.unit,
          measurementSource: input.measurementSource,
          widthMm: input.width,
          heightMm: input.height,
          lengthMm: input.length,
          depthMm: input.depth,
          thicknessMm: input.thickness,
          updatedByUserId: authenticatedActor.sub,
          version: { increment: 1 },
        },
      });
      this.assertVersionUpdated(result.count);

      const updated = await transaction.requestItem.findUniqueOrThrow({ where: { id: itemId } });
      await this.auditService.record({
        actorId: authenticatedActor.sub,
        action: 'UPDATE',
        resource: 'request_item',
        resourceId: itemId,
        metadata: {
          requestId,
          requestItemId: itemId,
          actorId: authenticatedActor.sub,
          version: updated.version,
          changedFields,
        },
      }, transaction);

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async delete(requestId: string, itemId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    await this.prisma.$transaction(async (transaction) => {
      const request = await this.getOwnedRequest(requestId, authenticatedActor, transaction);
      this.assertDraft(request.status, 'deleted');
      await this.getRequestItem(requestId, itemId, transaction);

      const result = await transaction.requestItem.deleteMany({
        where: { id: itemId, requestId, version },
      });
      this.assertVersionUpdated(result.count);

      await this.auditService.record({
        actorId: authenticatedActor.sub,
        action: 'DELETE',
        resource: 'request_item',
        resourceId: itemId,
        metadata: {
          requestId,
          requestItemId: itemId,
          actorId: authenticatedActor.sub,
          version,
          changedFields: [],
        },
      }, transaction);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { id: itemId, deleted: true };
  }

  private async getScopedRequest(requestId: string, actor: AuthenticatedUser, client: DatabaseClient = this.prisma) {
    const request = await client.request.findFirst({
      where: { id: requestId, ...this.buildScopeWhere(actor) },
      select: { id: true, companyId: true, productType: true, status: true },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }
    return request;
  }

  private async getOwnedRequest(requestId: string, actor: AuthenticatedUser, client: DatabaseClient = this.prisma) {
    const request = await client.request.findFirst({
      where: this.canManageScope(actor)
        ? { id: requestId }
        : {
            id: requestId,
            company: {
              memberships: {
                some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE },
              },
            },
          },
      select: { id: true, companyId: true, productType: true, status: true },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }
    return request;
  }

  private async getRequestItem(requestId: string, itemId: string, client: DatabaseClient = this.prisma) {
    const item = await client.requestItem.findFirst({ where: { id: itemId, requestId } });
    if (!item) {
      throw new NotFoundException('Request item not found');
    }
    return item;
  }

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.RequestWhereInput {
    if (this.canManageScope(actor)) {
      return {};
    }

    const activeMembership = {
      some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE },
    };
    return {
      OR: [
        { company: { memberships: activeMembership } },
        {
          status: { not: RequestStatus.DRAFT },
          recipients: { some: { company: { memberships: activeMembership } } },
        },
      ],
    };
  }

  private createChangedFields(input: CreateRequestItemDto): string[] {
    return [
      'description',
      'productType',
      'quantity',
      'unit',
      ...this.optionalChangedFields(input),
    ];
  }

  private updateChangedFields(input: UpdateRequestItemDto): string[] {
    return [
      ...(['description', 'productType', 'quantity', 'unit'] as const)
        .filter((field) => input[field] !== undefined),
      ...this.optionalChangedFields(input),
    ];
  }

  private optionalChangedFields(input: CreateRequestItemDto | UpdateRequestItemDto): string[] {
    const mapping = {
      productCode: 'productCode',
      measurementSource: 'measurementSource',
      width: 'widthMm',
      height: 'heightMm',
      length: 'lengthMm',
      depth: 'depthMm',
      thickness: 'thicknessMm',
    } as const;

    return Object.entries(mapping)
      .filter(([field]) => input[field as keyof typeof input] !== undefined)
      .map(([, persistedField]) => persistedField);
  }

  private assertDraft(status: RequestStatus, action: string): void {
    if (status !== RequestStatus.DRAFT) {
      throw new ConflictException(`Request items can only be ${action} while the request is a draft`);
    }
  }

  private assertVersionUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException('Request item was modified by another operation');
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

  private isRetryableCreateError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === 'P2002' || error.code === 'P2034');
  }
}