import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { CreateDemoPaymentDto } from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedPrincipal };

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.MEMBER)
export class MemberPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('me/fines')
  fines(@Req() request: AuthenticatedRequest) {
    return this.paymentsService.listMemberFines(request.user.userId);
  }

  @Post('payments/demo')
  payDemo(
    @Req() request: AuthenticatedRequest,
    @Body() data: CreateDemoPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.payFinesDemo(
      request.user.userId,
      data,
      idempotencyKey,
    );
  }

  @Get('me/payments')
  payments(@Req() request: AuthenticatedRequest) {
    return this.paymentsService.listMemberPayments(request.user.userId);
  }

  @Get('payments/:id/receipt')
  async receipt(
    @Req() request: AuthenticatedRequest,
    @Param('id') paymentId: string,
    @Res() response: Response,
  ) {
    const receipt = await this.paymentsService.memberReceipt(
      request.user.userId,
      paymentId,
    );
    response
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${receipt.receiptNo}.pdf"`,
        'Cache-Control': 'no-store',
      })
      .send(receipt.pdf);
  }
}
