import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import {
  LibrarySettings,
} from './entities/library-settings.entity.js';

const settingsKey = 'library';
const settingsId = new Types.ObjectId('000000000000000000000001');

@Injectable()
export class LibrarySettingsRepository {
  constructor(
    @InjectModel(LibrarySettings.name)
    private readonly settingsModel: Model<LibrarySettings>,
    private readonly config: ConfigService,
  ) {}

  async getOrCreate() {
    try {
      const settings = await this.settingsModel
        .findOneAndUpdate(
          { _id: settingsId },
          {
            $setOnInsert: {
              key: settingsKey,
              selfCheckout:
                this.config.get<string>('SELF_CHECKOUT')?.toLowerCase() ===
                'true',
            },
          },
          {  returnDocument: 'after' , upsert: true, setDefaultsOnInsert: true },
        )
        .lean()
        .exec();
      if (!settings) {
        throw new InternalServerErrorException(
          'Library settings could not be initialized',
        );
      }
      return settings;
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const settings = await this.settingsModel
        .findOne({ _id: settingsId })
        .lean()
        .exec();
      if (!settings) {
        throw new InternalServerErrorException(
          'Library settings could not be initialized',
        );
      }
      return settings;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  async update(updates: Record<string, unknown>) {
    const settings = await this.settingsModel
      .findOne({ _id: settingsId })
      .exec();
    if (!settings) {
      throw new NotFoundException('Library settings were not found');
    }
    for (const [path, value] of Object.entries(updates)) {
      settings.set(path, value);
    }
    await settings.save();
    return settings.toObject();
  }
}
