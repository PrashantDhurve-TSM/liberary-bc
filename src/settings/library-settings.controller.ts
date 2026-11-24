import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { UpdateLibrarySettingsDto } from './dto/update-library-settings.dto.js';
import { LibrarySettingsService } from './library-settings.service.js';

@Controller('admin/settings')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class LibrarySettingsController {
  constructor(
    private readonly settingsService: LibrarySettingsService,
  ) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() input: UpdateLibrarySettingsDto) {
    return this.settingsService.updateSettings(input);
  }
}
