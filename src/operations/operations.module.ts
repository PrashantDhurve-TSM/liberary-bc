import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Book, BookSchema } from '../catalog/entities/book.entity.js';
import { Fine, FineSchema } from '../circulation/entities/fine.entity.js';
import { Loan, LoanSchema } from '../circulation/entities/loan.entity.js';
import {
  Reservation,
  ReservationSchema,
} from '../circulation/entities/reservation.entity.js';
import { Payment, PaymentSchema } from '../payments/entities/payment.entity.js';
import { User, UserSchema } from '../user/entities/user.entity.js';
import { AdminAuditInterceptor } from './admin-audit.interceptor.js';
import {
  AdminOperationsController,
  MemberDashboardController,
} from './operations.controller.js';
import { AuditLog, AuditLogSchema } from './entities/audit-log.entity.js';
import { OperationsRepository } from './operations.repository.js';
import { OperationsService } from './operations.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Book.name, schema: BookSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: Fine.name, schema: FineSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AdminOperationsController, MemberDashboardController],
  providers: [
    OperationsRepository,
    OperationsService,
    AuthGuard,
    RolesGuard,
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
  ],
})
export class OperationsModule {}
