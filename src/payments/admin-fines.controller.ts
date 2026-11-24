import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import {
  AdminFinesQueryDto,
  AdminPaymentsQueryDto,
  CreateManualFineDto,
  PayFineDto,
  WaiveFineDto,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedPrincipal };

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.LIBRARIAN)
export class AdminFinesController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('fines')
  fines(@Query() query: AdminFinesQueryDto) {
    return this.paymentsService.listAdminFines(query);
  }

  @Post('fines')
  createFine(
    @Req() request: AuthenticatedRequest,
    @Body() data: CreateManualFineDto,
  ) {
    return this.paymentsService.createManualFine(
      request.user.userId,
      data,
    );
  }

  @Post('fines/:id/pay')
  payFine(
    @Req() request: AuthenticatedRequest,
    @Param('id') fineId: string,
    @Body() data: PayFineDto,
  ) {
    return this.paymentsService.payFineWithCash(
      request.user.userId,
      fineId,
      data,
    );
  }

  @Post('fines/:id/waive')
  @Roles(Role.ADMIN)
  waiveFine(
    @Req() request: AuthenticatedRequest,
    @Param('id') fineId: string,
    @Body() data: WaiveFineDto,
  ) {
    return this.paymentsService.waiveFine(
      request.user.userId,
      fineId,
      data,
    );
  }

  @Get('payments')
  payments(@Query() query: AdminPaymentsQueryDto) {
    return this.paymentsService.listAdminPayments(query);
  }
}
