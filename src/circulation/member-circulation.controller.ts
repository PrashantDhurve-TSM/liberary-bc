import {
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
import { MemberLoansQueryDto } from './dto/circulation.dto.js';
import { CirculationService } from './circulation.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedPrincipal };

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.MEMBER)
export class MemberCirculationController {
  constructor(private readonly circulationService: CirculationService) {}

  @Get('me/loans')
  getLoans(
    @Req() request: AuthenticatedRequest,
    @Query() query: MemberLoansQueryDto,
  ) {
    return this.circulationService.getMemberLoans(
      request.user.userId,
      query,
    );
  }

  @Get('me/reservations')
  getReservations(@Req() request: AuthenticatedRequest) {
    return this.circulationService.getMemberReservations(request.user.userId);
  }

  @Post('books/:id/borrow')
  borrow(
    @Req() request: AuthenticatedRequest,
    @Param('id') bookId: string,
  ) {
    return this.circulationService.borrowBook(request.user.userId, bookId);
  }

  @Post('books/:id/reserve')
  reserve(
    @Req() request: AuthenticatedRequest,
    @Param('id') bookId: string,
  ) {
    return this.circulationService.reserveBook(request.user.userId, bookId);
  }

  @Delete('reservations/:id')
  cancelReservation(
    @Req() request: AuthenticatedRequest,
    @Param('id') reservationId: string,
  ) {
    return this.circulationService.cancelMemberReservation(
      request.user.userId,
      reservationId,
    );
  }

  @Post('loans/:id/renew')
  renew(
    @Req() request: AuthenticatedRequest,
    @Param('id') loanId: string,
  ) {
    return this.circulationService.renewMemberLoan(
      request.user.userId,
      loanId,
    );
  }

  @Post('loans/:id/return-request')
  returnRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') loanId: string,
  ) {
    return this.circulationService.requestReturn(
      request.user.userId,
      loanId,
    );
  }
}
