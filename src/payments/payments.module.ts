import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Fine, FineSchema } from '../circulation/entities/fine.entity.js';
import {
  Notification,
  NotificationSchema,
} from '../circulation/entities/notification.entity.js';
import { User, UserSchema } from '../user/entities/user.entity.js';
import { AdminFinesController } from './admin-fines.controller.js';
import { MemberPaymentsController } from './member-payments.controller.js';
import { Payment, PaymentSchema } from './entities/payment.entity.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Fine.name, schema: FineSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [MemberPaymentsController, AdminFinesController],
  providers: [
    PaymentsRepository,
    PaymentsService,
    AuthGuard,
    RolesGuard,
  ],
})
export class PaymentsModule {}
