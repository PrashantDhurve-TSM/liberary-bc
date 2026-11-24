import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Role } from '../enums/role.enum.js';
import { isRole, type RefreshTokenClaims } from './auth.types.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issuePair(user: {
    id: string;
    email: string;
    role: Role;
  }): Promise<TokenPair> {
    const claims = { sub: user.id, email: user.email, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...claims, tokenUse: 'access', jti: randomUUID() },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn:
            this.config.get<JwtSignOptions['expiresIn']>('JWT_ACCESS_EXPIRES') ??
            '15m',
        },
      ),
      this.jwtService.signAsync(
        { ...claims, tokenUse: 'refresh', jti: randomUUID() },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn:
            this.config.get<JwtSignOptions['expiresIn']>('JWT_REFRESH_EXPIRES') ??
            '7d',
        },
      ),
    ]);

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenClaims> {
    let payload: Record<string, unknown>;

    try {
      payload = await this.jwtService.verifyAsync<Record<string, unknown>>(
        token,
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      !isRole(payload.role) ||
      payload.tokenUse !== 'refresh'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tokenUse: 'refresh',
    };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  matchesRefreshToken(token: string, storedHash: string): boolean {
    const tokenHash = Buffer.from(this.hashRefreshToken(token), 'hex');
    const expectedHash = Buffer.from(storedHash, 'hex');

    return (
      tokenHash.length === expectedHash.length &&
      timingSafeEqual(tokenHash, expectedHash)
    );
  }
}
