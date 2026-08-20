import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyMembershipStatus, CompanyStatus, CompanyVerificationStatus, Prisma, Role, User } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly passwordResetTokens = new Map<string, { userId: string; expiresAt: number; used: boolean }>();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async login(
    identifier: string,
    password: string,
    metadata: { ipAddress?: string; userAgent?: string; origin?: string },
  ) {
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.assertPanelAccess(user.role, metadata.origin);

    const tokens = await this.issueTokens(user);
    await this.usersService.updateRefreshTokenHash(
      user.id,
      await bcrypt.hash(tokens.refreshToken, 10),
    );

    await this.auditService.record({
      actorId: user.id,
      action: 'LOGIN',
      resource: 'auth',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: this.redactSensitiveMetadata({ identifier }),
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async register(
    input: RegisterDto,
    metadata: { ipAddress?: string; userAgent?: string; origin?: string },
  ) {
    this.assertPanelAccess(Role.SALES, metadata.origin);

    if (!this.isStrongPassword(input.password)) {
      throw new BadRequestException(
        'Password must contain at least 12 characters, uppercase, lowercase, a number, and no spaces.',
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const normalizedEmail = input.email.trim().toLowerCase();

    let created: { user: User; companyId: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            legalName: input.companyLegalName.trim(),
            tradeName: input.companyTradeName?.trim() || undefined,
            companyType: input.companyType,
            taxNumber: input.taxNumber?.trim() || undefined,
            verificationStatus: CompanyVerificationStatus.PENDING,
            status: CompanyStatus.ACTIVE,
          },
        });

        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            phone: input.phone?.trim() || undefined,
            fullName: input.fullName.trim(),
            passwordHash,
            role: Role.SALES,
          },
        });

        await tx.companyUserMembership.create({
          data: {
            companyId: company.id,
            userId: user.id,
            role: 'OWNER',
            status: CompanyMembershipStatus.ACTIVE,
          },
        });

        return { user, companyId: company.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email or phone already exists');
      }
      throw error;
    }

    const { user, companyId } = created;
    const tokens = await this.issueTokens(user);
    await this.usersService.updateRefreshTokenHash(
      user.id,
      await bcrypt.hash(tokens.refreshToken, 10),
    );

    await this.auditService.record({
      actorId: user.id,
      action: 'SELF_REGISTER',
      resource: 'auth',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: this.redactSensitiveMetadata({ email: normalizedEmail, companyId }),
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async refresh(userId: string, refreshToken: string, origin?: string) {
    const user = await this.usersService.findById(userId);
    this.assertPanelAccess(user.role, origin);
    if (!user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.issueTokens(user);
    await this.usersService.updateRefreshTokenHash(
      user.id,
      await bcrypt.hash(tokens.refreshToken, 10),
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshTokenHash(userId, null);

    await this.auditService.record({
      actorId: userId,
      action: 'LOGOUT',
      resource: 'auth',
      metadata: {},
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ success: true }> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Current credentials are invalid');
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (!this.isStrongPassword(newPassword)) {
      throw new BadRequestException(
        'Password must contain at least 12 characters, uppercase, lowercase, a number, and no spaces.',
      );
    }

    const nextHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePasswordHash(userId, nextHash);
    await this.usersService.updateRefreshTokenHash(userId, null);

    await this.auditService.record({
      actorId: userId,
      action: 'PASSWORD_CHANGE',
      resource: 'auth',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: this.redactSensitiveMetadata({ userId, success: true }),
    });

    return { success: true };
  }

  async rotatePassword(
    actorId: string,
    targetUserId: string,
    newPassword: string,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ success: true }> {
    const actor = await this.usersService.findById(actorId);
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('You are not allowed to rotate this password');
    }

    const targetUser = await this.usersService.findById(targetUserId);
    if (!targetUser || !targetUser.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (!this.isStrongPassword(newPassword)) {
      throw new BadRequestException(
        'Password must contain at least 12 characters, uppercase, lowercase, a number, and no spaces.',
      );
    }

    const nextHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePasswordHash(targetUserId, nextHash);
    await this.usersService.updateRefreshTokenHash(targetUserId, null);

    await this.auditService.record({
      actorId: actor.id,
      action: 'PASSWORD_ROTATION',
      resource: 'auth',
      resourceId: targetUserId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: this.redactSensitiveMetadata({ targetUserId, success: true }),
    });

    return { success: true };
  }

  async resetPassword(
    identifier: string,
    newPassword: string,
    resetToken: string,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ success: true }> {
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user || !user.isActive) {
      throw new BadRequestException('Password reset could not be completed.');
    }

    if (!resetToken || !this.isStrongPassword(newPassword)) {
      throw new BadRequestException('Password reset could not be completed.');
    }

    const tokenEntry = await this.consumeResetToken(resetToken);
    if (!tokenEntry || tokenEntry.userId !== user.id) {
      throw new BadRequestException('Password reset could not be completed.');
    }

    const nextHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePasswordHash(user.id, nextHash);
    await this.usersService.updateRefreshTokenHash(user.id, null);

    await this.auditService.record({
      actorId: user.id,
      action: 'PASSWORD_RESET',
      resource: 'auth',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: this.redactSensitiveMetadata({ userId: user.id, success: true }),
    });

    return { success: true };
  }

  async requestPasswordReset(identifier: string): Promise<{ acknowledged: true }> {
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user || !user.isActive) {
      return { acknowledged: true };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, 10);
    this.passwordResetTokens.set(tokenHash, {
      userId: user.id,
      expiresAt: Date.now() + 15 * 60 * 1000,
      used: false,
    });

    await this.auditService.record({
      actorId: user.id,
      action: 'PASSWORD_RESET_REQUEST',
      resource: 'auth',
      metadata: { acknowledged: true },
    });

    return { acknowledged: true };
  }

  async revokeSession(
    actorId: string,
    targetUserId: string,
    refreshToken?: string,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ success: true }> {
    const actor = await this.usersService.findById(actorId);
    if (actor.role !== Role.ADMIN && actor.id !== targetUserId) {
      throw new ForbiddenException('You are not allowed to revoke this session');
    }

    const targetUser = await this.usersService.findById(targetUserId);
    if (refreshToken) {
      if (!targetUser.refreshTokenHash) {
        throw new UnauthorizedException('Refresh token is already invalid');
      }

      const matches = await bcrypt.compare(refreshToken, targetUser.refreshTokenHash);
      if (!matches) {
        throw new UnauthorizedException('Invalid refresh token');
      }
    }

    await this.usersService.updateRefreshTokenHash(targetUserId, null);

    await this.auditService.record({
      actorId: actor.id,
      action: 'SESSION_REVOKE',
      resource: 'auth',
      resourceId: targetUserId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: this.redactSensitiveMetadata({ targetUserId, refreshTokenProvided: Boolean(refreshToken) }),
    });

    return { success: true };
  }

  async revokeAllSessions(
    actorId: string,
    targetUserId: string,
    metadata: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ success: true }> {
    const actor = await this.usersService.findById(actorId);
    if (actor.role !== Role.ADMIN && actor.id !== targetUserId) {
      throw new ForbiddenException('You are not allowed to revoke all sessions');
    }

    const targetUser = await this.usersService.findById(targetUserId);
    if (!targetUser) {
      throw new UnauthorizedException('User not found');
    }

    await this.usersService.updateRefreshTokenHash(targetUserId, null);

    await this.auditService.record({
      actorId: actor.id,
      action: 'SESSION_REVOKE_ALL',
      resource: 'auth',
      resourceId: targetUserId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: this.redactSensitiveMetadata({ targetUserId, revokedAll: true }),
    });

    return { success: true };
  }

  public sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      permissions: this.rbacService.resolvePermissions(user.role, (user.permissions as string[] | null) ?? []),
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private isStrongPassword(password: string): boolean {
    return typeof password === 'string'
      && password.length >= 12
      && !/\s/.test(password)
      && /[a-z]/.test(password)
      && /[A-Z]/.test(password)
      && /\d/.test(password);
  }

  private redactSensitiveMetadata<T extends Record<string, unknown>>(metadata: T): T {
    const safeEntries = Object.entries(metadata).filter(([key]) => {
      const normalized = key.toLowerCase();
      return !/(password|token|secret|hash)/.test(normalized);
    });

    return Object.fromEntries(safeEntries) as T;
  }

  private async consumeResetToken(token: string): Promise<{ userId: string; expiresAt: number; used: boolean } | null> {
    const activeTokens = Array.from(this.passwordResetTokens.entries());
    for (const [tokenHash, entry] of activeTokens) {
      if (entry.used || entry.expiresAt < Date.now()) {
        this.passwordResetTokens.delete(tokenHash);
        continue;
      }

      const isMatch = await bcrypt.compare(token, tokenHash);
      if (isMatch) {
        entry.used = true;
        this.passwordResetTokens.delete(tokenHash);
        return entry;
      }
    }

    return null;
  }

  private async issueTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const permissions = this.rbacService.resolvePermissions(
      user.role,
      (user.permissions as string[] | null) ?? [],
    );

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, tokenType: 'access' },
        {
          secret: this.configService.getOrThrow<string>('auth.accessSecret'),
          expiresIn: this.configService.getOrThrow<string>('auth.accessTtl') as any,
        },
      ),
      this.jwtService.signAsync(
        { ...payload, tokenType: 'refresh' },
        {
          secret: this.configService.getOrThrow<string>('auth.refreshSecret'),
          expiresIn: this.configService.getOrThrow<string>('auth.refreshTtl') as any,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private assertPanelAccess(role: User['role'], origin?: string): void {
    const panelOriginRoles = this.configService.get<Record<string, string[]>>('app.panelOriginRoles') ?? {};
    if (Object.keys(panelOriginRoles).length === 0) {
      return;
    }

    const allowedOrigins = Object.keys(panelOriginRoles);
    const trustedOrigin = origin && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins.find((candidate) => {
          const normalizedCandidate = candidate.replace(/\/$/, '');
          const normalizedOrigin = origin?.replace(/\/$/, '');
          return normalizedCandidate === normalizedOrigin;
        });

    if (!trustedOrigin) {
      const localFallbackOrigins = ['http://127.0.0.1:4177', 'http://localhost:4177'];
      const hasLocalFallback = localFallbackOrigins.some((candidate) => allowedOrigins.includes(candidate));
      if (hasLocalFallback && !origin) {
        return;
      }
    }

    const allowedRoles = trustedOrigin ? panelOriginRoles[trustedOrigin] : undefined;
    if (!allowedRoles?.includes(role)) {
      throw new UnauthorizedException('Account is not permitted for this panel');
    }
  }
}
