import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service.js';
import { TokenService } from './token.service.js';
import { HttpException, UnauthorizedException } from '@nestjs/common';

vi.mock('../common/security/password.js', () => ({
  hashPassword: vi.fn(async (password: string) => `hash:${password}`),
  verifyPassword: vi.fn(
    async (password: string, passwordHash: string) =>
      passwordHash === `hash:${password}`,
  ),
}));

describe('AuthService', () => {
  let service: AuthService;
  const userService = {
    findByEmailForAuth: vi.fn(),
    recordFailedLogin: vi.fn(),
    clearFailedLoginAttempts: vi.fn(),
    updateRefreshTokenHash: vi.fn(),
  };
  const tokenService = {
    issuePair: vi.fn(),
    hashRefreshToken: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: TokenService, useValue: tokenService },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('locks an account for 15 minutes after five failed password attempts', async () => {
    const user = {
      _id: { toString: () => 'user-1' },
      email: 'member@example.com',
      name: 'Library Member',
      memberId: 'M-1001',
      role: 'member',
      status: 'active',
      membershipType: 'student',
      passwordHash: 'hash:correct-password',
      loginLockedUntil: null,
    };
    userService.findByEmailForAuth.mockResolvedValue(user);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      userService.recordFailedLogin.mockResolvedValueOnce({
        failedLoginAttempts: attempt,
      });

      const request = service.login({
        email: user.email,
        password: 'wrong-password',
      });
      const error = await request.catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(
        attempt === 5 ? HttpException : UnauthorizedException,
      );
      if (attempt === 5) {
        if (error instanceof HttpException) {
          expect(error.getStatus()).toBe(429);
        }
      }
    }

    expect(userService.recordFailedLogin).toHaveBeenCalledTimes(5);
    expect(userService.recordFailedLogin).toHaveBeenLastCalledWith(
      'user-1',
      5,
      15,
    );
  });
});
