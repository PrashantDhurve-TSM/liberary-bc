import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { isRole, type AuthenticatedPrincipal } from '../auth.types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: Record<string, unknown>): AuthenticatedPrincipal {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      !isRole(payload.role) ||
      payload.tokenUse !== 'access'
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
