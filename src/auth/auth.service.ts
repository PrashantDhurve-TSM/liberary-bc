import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
} from '../common/security/password.js';
import { Role } from '../enums/role.enum.js';
import { UserService } from '../user/user.service.js';
import type { UserDocument } from '../user/entities/user.entity.js';
import type {
  CreateAdminDto,
  RegisterLibrarianDto,
  RegisterMemberDto,
} from '../user/dto/user.dto.js';
import { AdminLoginDto, LoginDto, RefreshTokenDto } from './dto/auth.dto.js';
import { TokenService, type TokenPair } from './token.service.js';

interface AuthResponse extends TokenPair {
  user: AuthUser;
}

interface StaffRegistrationResponse {
  user: AuthUser;
}

interface AuthUser {
  id: string;
  memberId: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  membershipType: string;
  status: string;
}

@Injectable()
export class AuthService {
  private readonly maxFailedLoginAttempts = 5;

  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  async registerMember(data: RegisterMemberDto): Promise<AuthResponse> {
    this.assertEmailAvailable(data.email);
    return this.createSession(await this.createAccount(data, Role.MEMBER));
  }

  async registerAdmin(
    data: CreateAdminDto,
  ): Promise<StaffRegistrationResponse> {
    this.assertEmailAvailable(data.email);
    const user = await this.createAccount(data, Role.ADMIN);
    return { user: this.toAuthUser(user) };
  }

  async registerLibrarian(
    data: RegisterLibrarianDto,
  ): Promise<StaffRegistrationResponse> {
    this.assertEmailAvailable(data.email);
    const user = await this.createAccount(data, Role.LIBRARIAN);
    return { user: this.toAuthUser(user) };
  }

  async login(
    data: LoginDto,
    allowedRoles?: readonly Role[],
  ): Promise<AuthResponse> {
    let user = await this.userService.findByEmailForAuth(data.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new ForbiddenException(
        user.status === 'suspended'
          ? 'Account suspended'
          : 'Account is not active',
      );
    }

    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      throw new HttpException(
        'Account temporarily locked. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (user.loginLockedUntil) {
      await this.userService.clearFailedLoginAttempts(user._id.toString());
    }

    let passwordMatches = false;
    if (user.passwordHash) {
      passwordMatches = await verifyPassword(data.password, user.passwordHash);
    } else if (
      user.password &&
      this.securelyEquals(data.password, user.password)
    ) {
      passwordMatches = true;
      user = await this.userService.migrateLegacyPassword(
        user._id.toString(),
        await hashPassword(data.password),
      );
    }

    if (!passwordMatches) {
      const updatedUser = await this.userService.recordFailedLogin(
        user._id.toString(),
        this.maxFailedLoginAttempts,
        15,
      );
      if (
        updatedUser &&
        updatedUser.failedLoginAttempts >= this.maxFailedLoginAttempts
      ) {
        throw new HttpException(
          'Account temporarily locked. Try again in 15 minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.userService.clearFailedLoginAttempts(user._id.toString());
    return this.createSession(user);
  }

  async adminLogin(data: AdminLoginDto): Promise<AuthResponse> {
    const adminEmail = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD');

    if (
      adminEmail &&
      adminPassword &&
      data.email.trim().toLowerCase() === adminEmail &&
      this.securelyEquals(data.password, adminPassword)
    ) {
      const admin = await this.userService.ensureAdminAccount(
        adminEmail,
        adminPassword,
      );
      if (admin.status !== 'active') {
        throw new UnauthorizedException('Invalid admin credentials');
      }
      return this.createSession(admin);
    }

    return this.login(data, [Role.ADMIN, Role.LIBRARIAN]);
  }

  async refresh(data: RefreshTokenDto): Promise<AuthResponse> {
    const claims = await this.tokenService.verifyRefreshToken(data.refreshToken);
    const user = await this.userService.findByIdForAuth(claims.sub);

    if (
      !user ||
      user.role !== claims.role ||
      user.email !== claims.email ||
      user.status !== 'active' ||
      !user.refreshTokenHash ||
      !this.tokenService.matchesRefreshToken(
        data.refreshToken,
        user.refreshTokenHash,
      )
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.createSession(user);
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.userService.updateRefreshTokenHash(userId, null);
    return { message: 'Logged out' };
  }

  private async createAccount(
    data: RegisterMemberDto | RegisterLibrarianDto | CreateAdminDto,
    role: Role,
  ): Promise<UserDocument> {
    try {
      switch (role) {
        case Role.MEMBER:
          return await this.userService.createMember(data);
        case Role.LIBRARIAN:
          return await this.userService.createLibrarian(data);
        case Role.ADMIN:
          return await this.userService.createAdmin(data);
      }
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  private async createSession(user: UserDocument): Promise<AuthResponse> {
    const tokens = await this.tokenService.issuePair({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    await this.userService.updateRefreshTokenHash(
      user._id.toString(),
      this.tokenService.hashRefreshToken(tokens.refreshToken),
    );

    return {
      ...tokens,
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(user: UserDocument): AuthUser {
    return {
      id: user._id.toString(),
      memberId: user.memberId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      membershipType: user.membershipType,
      status: user.status,
    };
  }

  private assertEmailAvailable(email: string): void {
    const adminEmail = this.config
      .get<string>('ADMIN_EMAIL')
      ?.trim()
      .toLowerCase();
    if (adminEmail && email.trim().toLowerCase() === adminEmail) {
      throw new ConflictException('This email is reserved for the admin account');
    }
  }

  private securelyEquals(left: string, right: string): boolean {
    const leftHash = createHash('sha256').update(left).digest();
    const rightHash = createHash('sha256').update(right).digest();
    return timingSafeEqual(leftHash, rightHash);
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
