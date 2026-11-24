import {
  Body,
  Controller,
  Delete,
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
  AdminLoansQueryDto,
  AdminReservationsQueryDto,
  IssueLoanDto,
  ReturnLoanDto,
} from './dto/circulation.dto.js';
import { CirculationService } from './circulation.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedPrincipal };

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.LIBRARIAN)
export class AdminCirculationController {
  constructor(private readonly circulationService: CirculationService) {}

  @Get('lookup/member')
  lookupMember(@Query('q') memberId = '') {
    return this.circulationService.lookupMember(memberId);
  }

  @Get('lookup/members')
  searchMembers(@Query('q') query = '') {
    return this.circulationService.searchMemberSuggestions(query);
  }

  @Get('lookup/books')
  searchBooks(
    @Query('q') query = '',
    @Query('copyStatus') copyStatus = 'available',
  ) {
    return this.circulationService.searchBookSuggestions(query, copyStatus);
  }

  @Get('lookup/copy')
  lookupCopy(@Query('barcode') barcode = '') {
    return this.circulationService.lookupCopy(barcode);
  }

  @Post('loans/issue')
  issue(
    @Req() request: AuthenticatedRequest,
    @Body() data: IssueLoanDto,
  ) {
    return this.circulationService.issueAtDesk(request.user.userId, data);
  }

  @Post('loans/return')
  return(
    @Req() request: AuthenticatedRequest,
    @Body() data: ReturnLoanDto,
  ) {
    return this.circulationService.returnAtDesk(request.user.userId, data);
  }

  @Post('loans/:id/renew')
  renew(
    @Req() request: AuthenticatedRequest,
    @Param('id') loanId: string,
  ) {
    return this.circulationService.renewAtDesk(
      request.user.userId,
      loanId,
    );
  }

  @Post('loans/:id/mark-lost')
  markLost(
    @Req() request: AuthenticatedRequest,
    @Param('id') loanId: string,
  ) {
    return this.circulationService.markLost(request.user.userId, loanId);
  }

  @Get('loans/overdue')
  overdue(@Query() query: AdminLoansQueryDto) {
    return this.circulationService.listOverdueLoans(query);
  }

  @Get('loans')
  loans(@Query() query: AdminLoansQueryDto) {
    return this.circulationService.listAdminLoans(query);
  }

  @Get('reservations')
  reservations(@Query() query: AdminReservationsQueryDto) {
    return this.circulationService.listAdminReservations(query);
  }

  @Post('reservations/:id/notify')
  notify(@Param('id') reservationId: string) {
    return this.circulationService.notifyReservation(reservationId);
  }

  @Delete('reservations/:id')
  cancelReservation(@Param('id') reservationId: string) {
    return this.circulationService.cancelAdminReservation(reservationId);
  }
}
