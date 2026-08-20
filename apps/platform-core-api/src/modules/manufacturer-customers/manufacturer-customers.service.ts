import { randomUUID } from 'node:crypto';

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyMembershipStatus, InviteStatus, Prisma, Role } from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateManufacturerCustomerDto } from './dto/create-manufacturer-customer.dto';
import { UpdateManufacturerCustomerDto } from './dto/update-manufacturer-customer.dto';

@Injectable()
export class ManufacturerCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const where = this.canManageScope(authenticatedActor)
      ? {}
      : {
          manufacturerCompany: {
            memberships: {
              some: { userId: authenticatedActor.sub, status: CompanyMembershipStatus.ACTIVE },
            },
          },
        };

    return this.prisma.manufacturerCustomer.findMany({
      where,
      orderBy: [{ createdAt: 'desc' as const }],
    });
  }

  async create(input: CreateManufacturerCustomerDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.assertCompanyMembership(input.manufacturerCompanyId, authenticatedActor);

    try {
      return await this.prisma.manufacturerCustomer.create({
        data: {
          code: this.createCustomerCode(),
          manufacturerCompanyId: input.manufacturerCompanyId,
          companyName: input.companyName.trim(),
          contactName: input.contactName.trim(),
          phone: input.phone.trim(),
          email: input.email.trim(),
          taxOffice: input.taxOffice.trim(),
          taxNo: input.taxNo.trim(),
          address: input.address.trim(),
          city: input.city.trim(),
          region: input.region.trim(),
          description: input.description.trim(),
          status: input.status ?? 'ACTIVE',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A manufacturer customer with this code already exists');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateManufacturerCustomerDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.prisma.manufacturerCustomer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Manufacturer customer not found');
    }
    await this.assertCompanyMembership(existing.manufacturerCompanyId, authenticatedActor);

    return this.prisma.manufacturerCustomer.update({
      where: { id },
      data: {
        companyName: input.companyName?.trim(),
        contactName: input.contactName?.trim(),
        phone: input.phone?.trim(),
        email: input.email?.trim(),
        taxOffice: input.taxOffice?.trim(),
        taxNo: input.taxNo?.trim(),
        address: input.address?.trim(),
        city: input.city?.trim(),
        region: input.region?.trim(),
        description: input.description?.trim(),
        status: input.status,
      },
    });
  }

  async remove(id: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.prisma.manufacturerCustomer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Manufacturer customer not found');
    }
    await this.assertCompanyMembership(existing.manufacturerCompanyId, authenticatedActor);

    await this.prisma.manufacturerCustomer.delete({ where: { id } });
    return { id };
  }

  async prepareInvite(id: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const existing = await this.prisma.manufacturerCustomer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Manufacturer customer not found');
    }
    await this.assertCompanyMembership(existing.manufacturerCompanyId, authenticatedActor);

    return this.prisma.manufacturerCustomer.update({
      where: { id },
      data: {
        inviteStatus: InviteStatus.PREPARED,
        inviteToken: `INV-${existing.code}-${randomUUID().slice(0, 8).toUpperCase()}`,
        invitePreparedAt: new Date(),
        invitePreparedBy: authenticatedActor.email,
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

  private createCustomerCode(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `FRM-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
