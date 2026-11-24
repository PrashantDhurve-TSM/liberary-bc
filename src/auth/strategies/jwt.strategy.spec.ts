import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Role } from '../../enums/role.enum.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  async function createStrategy() {
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-access-secret' },
        },
      ],
    }).compile();

    return module.get(JwtStrategy);
  }

  it('accepts access-token claims and returns the request principal', async () => {
    const strategy = await createStrategy();

    expect(
      strategy.validate({
        sub: 'user-id',
        email: 'member@example.com',
        role: Role.MEMBER,
        tokenUse: 'access',
      }),
    ).toEqual({
      userId: 'user-id',
      email: 'member@example.com',
      role: Role.MEMBER,
    });
  });

  it('rejects refresh-token claims', async () => {
    const strategy = await createStrategy();

    expect(() =>
      strategy.validate({
        sub: 'user-id',
        email: 'member@example.com',
        role: Role.MEMBER,
        tokenUse: 'refresh',
      }),
    ).toThrow(UnauthorizedException);
  });
});
