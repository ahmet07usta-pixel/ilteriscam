import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';

export function extractRefreshToken(request: Request): string | null {
  const fromCookie = request?.cookies?.refreshToken;
  const fromBody = request?.body?.refreshToken;
  const fromHeader = request?.headers
    ? ExtractJwt.fromAuthHeaderAsBearerToken()(request)
    : null;

  return fromCookie ?? fromBody ?? fromHeader ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractRefreshToken(request),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.refreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(request: Request, payload: AuthenticatedUser): AuthenticatedUser {
    const refreshToken = extractRefreshToken(request);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    return {
      ...payload,
      tokenType: 'refresh',
    };
  }
}
