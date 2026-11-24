import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../enums/role.enum.js';
import { TokenService } from './token.service.js';

describe('TokenService', () => {
  const service = new TokenService(
    new JwtService(),
    new ConfigService({
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_ACCESS_EXPIRES: '15m',
      JWT_REFRESH_EXPIRES: '7d',
    }),
  );

  it('issues separate access and refresh tokens and verifies refresh claims', async () => {
    const pair = await service.issuePair({
      id: 'user-id',
      email: 'member@example.com',
      role: Role.MEMBER,
    });

    await expect(
      service.verifyRefreshToken(pair.refreshToken),
    ).resolves.toMatchObject({
      sub: 'user-id',
      email: 'member@example.com',
      role: Role.MEMBER,
      tokenUse: 'refresh',
    });
    await expect(
      service.verifyRefreshToken(pair.accessToken),
    ).rejects.toThrow();
  });

  it('compares only the stored hash of a refresh token', async () => {
    const token = 'refresh-token';
    const hash = service.hashRefreshToken(token);

    expect(service.matchesRefreshToken(token, hash)).toBe(true);
    expect(service.matchesRefreshToken('different-token', hash)).toBe(false);
  });
});
