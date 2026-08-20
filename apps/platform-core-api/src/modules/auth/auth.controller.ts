import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RefreshTokenGuard } from '../../common/guards/refresh-token.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { extractRefreshToken } from './strategies/jwt-refresh.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body.identifier, body.password, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
    });

    this.setRefreshCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
    });

    this.setRefreshCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @Public()
  @UseGuards(RefreshTokenGuard)
  async refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = extractRefreshToken(req)!;
    const result = await this.authService.refresh(user.sub, refreshToken, req.headers.origin);

    this.setRefreshCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.sub);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPublicProfile(user.sub);
  }

  @Post('password/change')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(user.sub, body.currentPassword, body.newPassword, {
      ipAddress: undefined,
      userAgent: undefined,
    });
  }

  @Post('password/reset/request')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestPasswordReset(@Body() body: { identifier: string }) {
    return this.authService.requestPasswordReset(body.identifier);
  }

  @Post('password/rotate')
  @Permissions(PERMISSIONS.AUTH_MANAGE)
  async rotatePassword(@CurrentUser() user: AuthenticatedUser, @Body() body: { targetUserId: string; newPassword: string }) {
    return this.authService.rotatePassword(user.sub, body.targetUserId, body.newPassword, {
      ipAddress: undefined,
      userAgent: undefined,
    });
  }

  @Post('password/reset')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() body: { identifier: string; newPassword: string; resetToken: string }) {
    return this.authService.resetPassword(body.identifier, body.newPassword, body.resetToken, {
      ipAddress: undefined,
      userAgent: undefined,
    });
  }

  @Post('sessions/revoke')
  @Permissions(PERMISSIONS.AUTH_MANAGE)
  async revokeSession(@CurrentUser() user: AuthenticatedUser, @Body() body: { targetUserId: string; refreshToken?: string }) {
    return this.authService.revokeSession(user.sub, body.targetUserId, body.refreshToken, {
      ipAddress: undefined,
      userAgent: undefined,
    });
  }

  @Post('sessions/revoke-all')
  @Permissions(PERMISSIONS.AUTH_MANAGE)
  async revokeAllSessions(@CurrentUser() user: AuthenticatedUser, @Body() body: { targetUserId: string }) {
    return this.authService.revokeAllSessions(user.sub, body.targetUserId, {
      ipAddress: undefined,
      userAgent: undefined,
    });
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    const configuredDomain = this.configService.get<string>('app.cookieDomain')?.trim();
    const cookieDomain = configuredDomain && !['localhost', '127.0.0.1', '::1'].includes(configuredDomain)
      ? configuredDomain
      : undefined;

    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      domain: cookieDomain,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    const configuredDomain = this.configService.get<string>('app.cookieDomain')?.trim();
    const cookieDomain = configuredDomain && !['localhost', '127.0.0.1', '::1'].includes(configuredDomain)
      ? configuredDomain
      : undefined;

    response.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      domain: cookieDomain,
      path: '/',
    });
  }
}
