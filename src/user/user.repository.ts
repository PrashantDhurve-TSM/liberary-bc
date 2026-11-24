import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Role } from '../enums/role.enum.js';
import { Counter } from './entities/counter.schema.js';
import { User, UserDocument } from './entities/user.entity.js';
import { UpdateProfileDto, UpdateUserDto } from './dto/user.dto.js';

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Counter.name) private readonly counterModel: Model<Counter>,
  ) {}

  create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  findByEmailForAuth(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email })
      .select(
        '+passwordHash +refreshTokenHash +password +refreshToken +failedLoginAttempts +loginLockedUntil',
      )
      .exec();
  }

  findByIdForAuth(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findById(id)
      .select(
        '+passwordHash +refreshTokenHash +password +refreshToken +failedLoginAttempts +loginLockedUntil',
      )
      .exec();
  }

  recordFailedLogin(
    id: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<UserDocument | null> {
    const attempts = {
      $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1],
    };
    const lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);

    return this.userModel
      .findOneAndUpdate(
        { _id: id },
        [
          {
            $set: {
              failedLoginAttempts: attempts,
              loginLockedUntil: {
                $cond: [
                  { $gte: [attempts, maxAttempts] },
                  lockUntil,
                  { $ifNull: ['$loginLockedUntil', null] },
                ],
              },
            },
          },
        ],
        { new: true, updatePipeline: true },
      )
      .select('+failedLoginAttempts +loginLockedUntil')
      .exec();
  }

  async clearFailedLoginAttempts(id: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        { $set: { failedLoginAttempts: 0, loginLockedUntil: null } },
      )
      .exec();
  }

  async migrateLegacyPassword(
    id: string,
    passwordHash: string,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: { passwordHash },
          $unset: { password: 1, refreshToken: 1 },
        },
      )
      .exec();
  }

  async updateRefreshTokenHash(
    id: string,
    refreshTokenHash: string | null,
  ): Promise<boolean> {
    const result = await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            refreshTokenHash,
            ...(refreshTokenHash ? { lastLoginAt: new Date() } : {}),
          },
          $unset: { refreshToken: 1 },
        },
      )
      .exec();

    return result.matchedCount > 0;
  }

  findAll(): Promise<UserDocument[]> {
    return this.userModel.find().exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  update(id: string, data: UpdateUserDto): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
      .exec();
  }

  updateProfile(
    id: string,
    data: UpdateProfileDto,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: data },
        { new: true, runValidators: true },
      )
      .exec();
  }

  async updatePasswordAndRevokeRefreshToken(
    id: string,
    passwordHash: string,
  ): Promise<boolean> {
    const result = await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: { passwordHash, refreshTokenHash: null },
          $unset: { password: 1, refreshToken: 1 },
        },
      )
      .exec();

    return result.matchedCount > 0;
  }

  delete(id: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  async nextMemberSequence(): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { name: Role.MEMBER },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (!counter) {
      throw new Error('Unable to allocate a member ID');
    }

    return counter.seq;
  }
}
