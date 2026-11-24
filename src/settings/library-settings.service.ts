import { BadRequestException, Injectable } from '@nestjs/common';
import { LibrarySettingsRepository } from './library-settings.repository.js';
import { UpdateLibrarySettingsDto } from './dto/update-library-settings.dto.js';

@Injectable()
export class LibrarySettingsService {
  constructor(
    private readonly settingsRepository: LibrarySettingsRepository,
  ) {}

  getSettings() {
    return this.settingsRepository.getOrCreate();
  }

  async updateSettings(input: UpdateLibrarySettingsDto) {
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === null) {
        throw new BadRequestException(`Setting "${key}" cannot be null`);
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (nestedValue === null) {
            throw new BadRequestException(
              `Setting "${key}.${nestedKey}" cannot be null`,
            );
          }
          if (nestedValue !== undefined) {
            updates[`${key}.${nestedKey}`] = nestedValue;
          }
        }
      } else if (value !== undefined) {
        updates[key] = value;
      }
    }
    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('At least one setting must be provided');
    }

    await this.settingsRepository.getOrCreate();
    return this.settingsRepository.update(updates);
  }
}
