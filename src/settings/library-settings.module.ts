import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import {
  LibrarySettings,
  LibrarySettingsSchema,
} from './entities/library-settings.entity.js';
import { LibrarySettingsController } from './library-settings.controller.js';
import { LibrarySettingsRepository } from './library-settings.repository.js';
import { LibrarySettingsService } from './library-settings.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LibrarySettings.name, schema: LibrarySettingsSchema },
    ]),
  ],
  controllers: [LibrarySettingsController],
  providers: [
    LibrarySettingsRepository,
    LibrarySettingsService,
    AuthGuard,
    RolesGuard,
  ],
  exports: [LibrarySettingsService],
})
export class LibrarySettingsModule {}
