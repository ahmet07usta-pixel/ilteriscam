import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CompanyMembershipStatus, Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
  ) {}

  async onModuleInit(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      const existingAdmin = await this.prisma.user.findUnique({ where: { email: adminEmail } });
      if (existingAdmin) {
        const matchesDefault = await bcrypt.compare(adminPassword, existingAdmin.passwordHash);
        if (!matchesDefault) {
          await this.prisma.user.update({
            where: { id: existingAdmin.id },
            data: { passwordHash: await bcrypt.hash(adminPassword, 10), isActive: true },
          });
        }
      } else {
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        await this.prisma.user.create({
          data: {
            email: adminEmail,
            passwordHash,
            fullName: 'Platform Admin',
            role: Role.ADMIN,
          },
        });
      }
    }

    const fixtureUsers = [
      {
        email: process.env.SYNTHETIC_ADMIN_EMAIL ?? 'synthetic-admin@localhost',
        password: process.env.SYNTHETIC_ADMIN_PASSWORD ?? 'Admin123',
        fullName: 'Synthetic Admin',
        role: Role.ADMIN,
        permissions: ['auth.manage', 'users.read', 'users.manage', 'audit.read'],
      },
      {
        email: process.env.SYNTHETIC_USER_A_EMAIL ?? 'synthetic-user-a@localhost',
        password: process.env.SYNTHETIC_USER_A_PASSWORD ?? 'Buyer123',
        fullName: 'Synthetic User A',
        role: Role.USER,
        permissions: ['users.read'],
      },
      {
        email: process.env.SYNTHETIC_USER_B_EMAIL ?? 'synthetic-user-b@localhost',
        password: process.env.SYNTHETIC_USER_B_PASSWORD ?? 'Buyer456',
        fullName: 'Synthetic User B',
        role: Role.USER,
        permissions: ['users.read'],
      },
      {
        email: process.env.SYNTHETIC_PRODUCER_EMAIL ?? 'synthetic-producer@localhost',
        password: process.env.SYNTHETIC_PRODUCER_PASSWORD ?? 'Producer123',
        fullName: 'Synthetic Producer',
        role: Role.PRODUCER,
        permissions: ['users.read'],
      },
    ];

    for (const fixtureUser of fixtureUsers) {
      const existing = await this.prisma.user.findUnique({ where: { email: fixtureUser.email } });

      if (!existing) {
        await this.prisma.user.create({
          data: {
            email: fixtureUser.email,
            fullName: fixtureUser.fullName,
            passwordHash: await bcrypt.hash(fixtureUser.password, 12),
            role: fixtureUser.role,
            permissions: fixtureUser.permissions,
            isActive: true,
          },
        });
        continue;
      }

      const matchesFixturePassword = await bcrypt.compare(fixtureUser.password, existing.passwordHash);
      if (!matchesFixturePassword) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: await bcrypt.hash(fixtureUser.password, 12),
            role: fixtureUser.role,
            permissions: fixtureUser.permissions,
            isActive: true,
            fullName: fixtureUser.fullName,
          },
        });
      }
    }
  }

  async createUser(payload: {
    email: string;
    phone?: string;
    fullName: string;
    password: string;
    role: Role;
    permissions?: string[];
  }): Promise<User> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: payload.email }, payload.phone ? { phone: payload.phone } : undefined].filter(
          Boolean,
        ) as Prisma.UserWhereInput[],
      },
    });

    if (existing) {
      throw new ConflictException('User already exists');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    return this.prisma.user.create({
      data: {
        email: payload.email,
        phone: payload.phone,
        fullName: payload.fullName,
        passwordHash,
        role: payload.role,
        permissions: payload.permissions,
      },
    });
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
        isActive: true,
      },
    });
  }

  async findById(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async listUsers(): Promise<Array<Omit<User, 'passwordHash' | 'refreshTokenHash'>>> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: { status: CompanyMembershipStatus.ACTIVE },
          select: {
            id: true,
            companyId: true,
            role: true,
            status: true,
            company: { select: { id: true, legalName: true, tradeName: true, status: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { memberships, ...rest } = user;
    const primaryMembership = memberships[0];

    return {
      ...rest,
      permissions: this.rbacService.resolvePermissions(user.role, (user.permissions as string[] | null) ?? []),
      companyId: primaryMembership?.companyId,
      company: primaryMembership?.company.tradeName ?? primaryMembership?.company.legalName,
      memberships,
    };
  }

  async updatePasswordHash(userId: string, hash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });
  }

  async updateRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }
}
