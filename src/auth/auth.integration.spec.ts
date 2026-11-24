import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import request from 'supertest';
import { Role } from '../enums/role.enum.js';
import { corsConfig } from '../configs/security.config.js';
import type { AuthenticatedPrincipal } from './auth.types.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TokenService } from './token.service.js';
import { UserService } from '../user/user.service.js';

vi.mock('../common/security/password.js', () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
  verifyPassword: vi.fn(
    async (password: string, passwordHash: string) =>
      passwordHash === `hashed:${password}`,
  ),
}));

type TestUser = {
  _id: { toString: () => string };
  memberId: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  membershipType: string;
  status: string;
  passwordHash: string;
  failedLoginAttempts: number;
  loginLockedUntil: Date | null;
  refreshTokenHash: string | null;
};

class IntegrationAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedPrincipal }
    >();
    const requestedRole = request.headers['x-test-role'];
    if (typeof requestedRole !== 'string') {
      throw new UnauthorizedException();
    }
    const role = Object.values(Role).find(
      (candidate) => candidate === requestedRole,
    );
    if (!role) {
      throw new UnauthorizedException();
    }

    request.user = {
      userId: 'test-admin-id',
      email: 'admin@example.com',
      role,
    };
    return true;
  }
}

describe('Authentication HTTP integration', () => {
  let app: INestApplication;
  let users: Map<string, TestUser>;
  let userService: Record<string, ReturnType<typeof vi.fn>>;

  const makeUser = (
    data: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      membershipType?: string;
    },
    role: Role,
  ): TestUser => {
    const normalizedEmail = data.email.trim().toLowerCase();
    const id = String(users.size + 1);
    const user: TestUser = {
      _id: { toString: () => id },
      memberId: `${role === Role.MEMBER ? 'M' : role === Role.ADMIN ? 'A' : 'L'}-${id}`,
      name: data.name,
      email: normalizedEmail,
      phone: data.phone,
      role,
      membershipType: data.membershipType ?? 'student',
      status: 'active',
      passwordHash: `hashed:${data.password}`,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      refreshTokenHash: null,
    };
    users.set(normalizedEmail, user);
    return user;
  };

  beforeEach(async () => {
    users = new Map();
    userService = {
      createMember: vi.fn((data) => makeUser(data, Role.MEMBER)),
      createAdmin: vi.fn((data) => makeUser(data, Role.ADMIN)),
      createLibrarian: vi.fn((data) => makeUser(data, Role.LIBRARIAN)),
      ensureAdminAccount: vi.fn((email, password) => {
        const existing = users.get(email);
        return existing ?? makeUser(
          {
            name: 'Library Administrator',
            email,
            password,
            membershipType: 'public',
          },
          Role.ADMIN,
        );
      }),
      findByEmailForAuth: vi.fn(
        (email) => users.get(email.trim().toLowerCase()) ?? null,
      ),
      findByIdForAuth: vi.fn(
        (id) =>
          [...users.values()].find(
            (candidate) => candidate._id.toString() === id,
          ) ?? null,
      ),
      updateRefreshTokenHash: vi.fn((id, hash) => {
        const user = [...users.values()].find(
          (candidate) => candidate._id.toString() === id,
        );
        if (user) user.refreshTokenHash = hash;
      }),
      clearFailedLoginAttempts: vi.fn((id) => {
        const user = [...users.values()].find(
          (candidate) => candidate._id.toString() === id,
        );
        if (user) {
          user.failedLoginAttempts = 0;
          user.loginLockedUntil = null;
        }
      }),
      recordFailedLogin: vi.fn(),
    };

    const tokenService = {
      issuePair: vi.fn(async ({ id }: { id: string }) => ({
        accessToken: `access-${id}`,
        refreshToken: `refresh-${id}`,
      })),
      hashRefreshToken: vi.fn((token: string) => `hashed:${token}`),
      matchesRefreshToken: vi.fn(
        (token: string, tokenHash: string) => tokenHash === `hashed:${token}`,
      ),
      verifyRefreshToken: vi.fn(async (token: string) => {
        const user = [...users.values()].find(
          (candidate) => candidate.refreshTokenHash === `hashed:${token}`,
        );
        if (!user) throw new Error('Invalid refresh token');
        return {
          sub: user._id.toString(),
          email: user.email,
          role: user.role,
          tokenUse: 'refresh' as const,
        };
      }),
    };
    const configService = {
      get: (key: string) =>
        key === 'ADMIN_EMAIL'
          ? 'root@example.com'
          : key === 'ADMIN_PASSWORD'
            ? 'RootPass123'
            : undefined,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: TokenService, useValue: tokenService },
        { provide: ConfigService, useValue: configService },
        { provide: AuthGuard, useClass: IntegrationAuthGuard },
        {
          provide: RolesGuard,
          useFactory: () => new RolesGuard(new Reflector()),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors(corsConfig);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows the configured frontend origin to call auth endpoints', async () => {
    await request(app.getHttpServer())
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173');
  });

  it('registers a member and signs the member in using the raw auth response', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Aarav Patil',
        email: 'aarav@example.com',
        password: 'MemberPass123',
        membershipType: 'student',
      })
      .expect(201);

    expect(registration.body.user.role).toBe(Role.MEMBER);
    expect(registration.body.accessToken).toBe('access-1');
    expect(registration.body.success).toBeUndefined();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'aarav@example.com', password: 'MemberPass123' })
      .expect(201);

    expect(login.body.user.role).toBe(Role.MEMBER);
    expect(login.body.accessToken).toBe('access-1');

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);

    expect(refreshed.body.user.role).toBe(Role.MEMBER);
    expect(refreshed.body.refreshToken).toBe('refresh-1');
  });

  it('creates staff accounts only for admins and supports staff sign-in', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register/librarian')
      .set('x-test-role', Role.LIBRARIAN)
      .send({
        name: 'Librarian',
        email: 'librarian@example.com',
        password: 'Librarian123',
      })
      .expect(403);

    const librarian = await request(app.getHttpServer())
      .post('/api/auth/register/librarian')
      .set('x-test-role', Role.ADMIN)
      .send({
        name: 'Librarian',
        email: 'librarian@example.com',
        password: 'Librarian123',
      })
      .expect(201);

    expect(librarian.body.user.role).toBe(Role.LIBRARIAN);
    expect(librarian.body.accessToken).toBeUndefined();

    const admin = await request(app.getHttpServer())
      .post('/api/auth/admin/create')
      .set('x-test-role', Role.ADMIN)
      .send({
        name: 'Second Admin',
        email: 'second-admin@example.com',
        password: 'SecondAdmin123',
      })
      .expect(201);

    expect(admin.body.user.role).toBe(Role.ADMIN);
    expect(admin.body.accessToken).toBeUndefined();

    const staffLogin = await request(app.getHttpServer())
      .post('/api/auth/admin/login')
      .send({
        email: 'librarian@example.com',
        password: 'Librarian123',
      })
      .expect(201);

    expect(staffLogin.body.user.role).toBe(Role.LIBRARIAN);
    expect(staffLogin.body.accessToken).toBe('access-1');
  });

  it('bootstraps the configured administrator and rejects members on staff sign-in', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/admin/login')
      .send({ email: 'root@example.com', password: 'RootPass123' })
      .expect(201);

    expect(adminLogin.body.user.role).toBe(Role.ADMIN);
    expect(userService.ensureAdminAccount).toHaveBeenCalledOnce();

    await request(app.getHttpServer())
      .post('/api/auth/register/member')
      .send({
        name: 'Member',
        email: 'member@example.com',
        password: 'MemberPass123',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/admin/login')
      .send({ email: 'member@example.com', password: 'MemberPass123' })
      .expect(401);
  });
});
