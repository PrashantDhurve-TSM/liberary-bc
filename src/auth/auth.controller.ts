import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import {
  AdminLoginDto,
  LoginDto,
  RefreshTokenDto,
} from './dto/auth.dto.js';
import { AuthGuard } from './guards/auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import type { AuthenticatedPrincipal } from './auth.types.js';
import { Roles } from './roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import {
  CreateAdminDto,
  RegisterLibrarianDto,
  RegisterMemberDto,
} from '../user/dto/user.dto.js';

type AuthenticatedRequest = Request & {
  user: AuthenticatedPrincipal;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/member')
  registerMember(@Body() data: RegisterMemberDto): Promise<unknown> {
    return this.authService.registerMember(data);
  }

  @Post('register')
  register(@Body() data: RegisterMemberDto): Promise<unknown> {
    return this.authService.registerMember(data);
  }

  @Post(['register/librarian', 'admin/create/librarian'])
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  registerLibrarian(@Body() data: RegisterLibrarianDto): Promise<unknown> {
    return this.authService.registerLibrarian(data);
  }

  @Post('admin/create')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  registerAdmin(@Body() data: CreateAdminDto): Promise<unknown> {
    return this.authService.registerAdmin(data);
  }

  @Post()
  loginAtRoot(@Body() data: LoginDto): Promise<unknown> {
    return this.authService.login(data);
  }

  @Post('login')
  login(@Body() data: LoginDto): Promise<unknown> {
    return this.authService.login(data);
  }

  @Post('admin/login')
  adminLogin(@Body() data: AdminLoginDto): Promise<unknown> {
    return this.authService.adminLogin(data);
  }

  @Post('refresh')
  refresh(@Body() data: RefreshTokenDto): Promise<unknown> {
    return this.authService.refresh(data);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.authService.logout(request.user.userId);
  }
}
