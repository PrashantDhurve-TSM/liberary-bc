import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto/user.dto.js';
import { UserService } from './user.service.js';

type AuthenticatedRequest = Request & {
  user: AuthenticatedPrincipal;
};

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async getProfile(@Req() request: AuthenticatedRequest) {
    const user = await this.userService.findOne(request.user.userId);
    if (!user) {
      throw new NotFoundException('Account not found');
    }
    return user;
  }

  @Patch()
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() data: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(request.user.userId, data);
  }

  @Post('change-password')
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() data: ChangePasswordDto,
  ) {
    return this.userService.changePassword(request.user.userId, data);
  }
}
