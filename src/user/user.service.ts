import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  hashPassword,
  verifyPassword,
} from '../common/security/password.js';
import { memberShipType, Role, userStatus } from '../enums/role.enum.js';
import {
  CreateUserDto,
  ChangePasswordDto,
  RegisterMemberDto,
  UpdateProfileDto,
  UpdateUserDto,
  CreateMemberDto,
} from './dto/user.dto.js';
import { UserDocument } from './entities/user.entity.js';
import { UserRepository } from './user.repository.js';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async createMember(data: RegisterMemberDto): Promise<UserDocument> {
    return this.createWithRole(data, Role.MEMBER);
  }

  async createLibrarian(data: RegisterMemberDto): Promise<UserDocument> {
    return this.createWithRole(data, Role.LIBRARIAN);
  }

  async createAdmin(data: RegisterMemberDto): Promise<UserDocument> {
    return this.createWithRole(data, Role.ADMIN, userStatus.ACTION);
  }

  async createMemberImportTemplate() {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Members').addRow([
      'name',
      'email',
      'phone',
      'membershipType',
      'password',
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importMembersWorkbook(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer,
      );
    } catch {
      throw new BadRequestException('The uploaded file is not a valid .xlsx workbook');
    }

    const sheet = workbook.worksheets.find(
      (item) => item.name.toLowerCase() === 'members',
    );
    if (!sheet) {
      throw new BadRequestException('Workbook must contain a Members sheet');
    }
    if (sheet.rowCount > 1001) {
      throw new BadRequestException('The Members sheet can contain at most 1,000 data rows');
    }

    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, columnNumber) => {
      const key = String(cell.value ?? '').trim().toLowerCase();
      if (key) columns.set(key, columnNumber);
    });
    for (const required of ['name', 'email', 'membershiptype', 'password']) {
      if (!columns.has(required)) {
        throw new BadRequestException(`Members sheet is missing required column: ${required}`);
      }
    }

    const result = {
      membersCreated: 0,
      errors: [] as { sheet: string; row: number; message: string }[],
    };
    const seenEmails = new Set<string>();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      const value = (key: string) => {
        const column = columns.get(key);
        return column ? String(row.getCell(column).value ?? '').trim() : '';
      };
      const email = value('email').toLowerCase();
      const payload = {
        name: value('name'),
        email,
        ...(value('phone') ? { phone: value('phone') } : {}),
        membershipType: value('membershiptype'),
        password: value('password'),
      };
      if (!payload.name && !email && !payload.password) continue;
      if (seenEmails.has(email)) {
        result.errors.push({ sheet: 'Members', row: rowNumber, message: `Duplicate email: ${email}` });
        continue;
      }
      seenEmails.add(email);

      const dto = plainToInstance(CreateMemberDto, payload);
      const errors = await validate(dto);
      if (errors.length) {
        result.errors.push({
          sheet: 'Members',
          row: rowNumber,
          message: errors.flatMap((error) => Object.values(error.constraints ?? {})).join(', '),
        });
        continue;
      }
      try {
        await this.createMember(dto);
        result.membersCreated += 1;
      } catch (error) {
        result.errors.push({
          sheet: 'Members',
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Could not create member',
        });
      }
    }
    return result;
  }

  async createUser(data: CreateUserDto): Promise<UserDocument> {
    return this.createWithRole(
      data,
      data.role ?? Role.MEMBER,
      data.status ?? userStatus.ACTION,
    );
  }

  async ensureAdminAccount(
    email: string,
    password: string,
  ): Promise<UserDocument> {
    const existing = await this.findByEmailForAuth(email);
    if (existing) {
      if (existing.role !== Role.ADMIN) {
        throw new ConflictException(
          'The configured admin email is already used by another account',
        );
      }
      if (
        existing.passwordHash &&
        (await verifyPassword(password, existing.passwordHash))
      ) {
        return existing;
      }

      return this.migrateLegacyPassword(
        existing._id.toString(),
        await hashPassword(password),
      );
    }

    try {
      return await this.createWithRole(
        {
          name: 'Library Administrator',
          email,
          password,
          membershipType: memberShipType.PUBLIC,
        },
        Role.ADMIN,
      );
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }

      const concurrentAccount = await this.findByEmailForAuth(email);
      if (concurrentAccount?.role === Role.ADMIN) {
        if (
          concurrentAccount.passwordHash &&
          (await verifyPassword(password, concurrentAccount.passwordHash))
        ) {
          return concurrentAccount;
        }
        return this.migrateLegacyPassword(
          concurrentAccount._id.toString(),
          await hashPassword(password),
        );
      }
      throw new ConflictException(
        'The configured admin email is already used by another account',
      );
    }
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userRepository.findByEmail(this.normalizeEmail(email));
  }

  findByEmailForAuth(email: string): Promise<UserDocument | null> {
    return this.userRepository.findByEmailForAuth(this.normalizeEmail(email));
  }

  findByIdForAuth(id: string): Promise<UserDocument | null> {
    return this.userRepository.findByIdForAuth(id);
  }

  recordFailedLogin(
    id: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<UserDocument | null> {
    return this.userRepository.recordFailedLogin(id, maxAttempts, lockMinutes);
  }

  clearFailedLoginAttempts(id: string): Promise<void> {
    return this.userRepository.clearFailedLoginAttempts(id);
  }

  async updateProfile(
    id: string,
    data: UpdateProfileDto,
  ): Promise<UserDocument> {
    if (data.email) {
      const existingUser = await this.findByEmail(data.email);
      if (existingUser && existingUser._id.toString() !== id) {
        throw new ConflictException('An account with this email already exists');
      }
    }

    let user: UserDocument | null;
    try {
      user = await this.userRepository.updateProfile(id, {
        ...data,
        ...(data.email ? { email: this.normalizeEmail(data.email) } : {}),
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.phone ? { phone: data.phone.trim() } : {}),
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
    if (!user) {
      throw new NotFoundException('Account not found');
    }
    return user;
  }

  async changePassword(
    id: string,
    data: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.findByIdForAuth(id);
    if (
      !user?.passwordHash ||
      !(await verifyPassword(data.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const updated = await this.userRepository.updatePasswordAndRevokeRefreshToken(
      id,
      await hashPassword(data.newPassword),
    );
    if (!updated) {
      throw new NotFoundException('Account not found');
    }

    return { message: 'Password changed. Please sign in again.' };
  }

  async migrateLegacyPassword(
    id: string,
    passwordHash: string,
  ): Promise<UserDocument> {
    await this.userRepository.migrateLegacyPassword(id, passwordHash);

    const user = await this.findByIdForAuth(id);
    if (!user) {
      throw new ConflictException('Account no longer exists');
    }
    return user;
  }

  async updateRefreshTokenHash(
    id: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    if (
      !(await this.userRepository.updateRefreshTokenHash(id, refreshTokenHash))
    ) {
      throw new ConflictException('Account no longer exists');
    }
  }

  findAll() {
    return this.userRepository.findAll();
  }

  findOne(id: string) {
    return this.userRepository.findById(id);
  }

  update(id: string, data: UpdateUserDto) {
    return this.userRepository.update(id, data);
  }

  remove(id: string) {
    return this.userRepository.delete(id);
  }

  private async createWithRole(
    data: RegisterMemberDto,
    role: Role,
    status = userStatus.ACTION,
  ): Promise<UserDocument> {
    const [sequence, passwordHash] = await Promise.all([
      this.userRepository.nextMemberSequence(),
      hashPassword(data.password),
    ]);

    return this.userRepository.create({
      name: data.name.trim(),
      email: this.normalizeEmail(data.email),
      phone: data.phone?.trim(),
      passwordHash,
      role,
      memberId:
        role === Role.MEMBER
          ? `M-${String(1000 + sequence).padStart(4, '0')}`
          : `${role === Role.ADMIN ? 'A' : 'L'}-${String(sequence).padStart(4, '0')}`,
      membershipType: data.membershipType ?? memberShipType.STUDENT,
      status,
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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
