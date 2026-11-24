import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Book, BookSchema } from '../catalog/entities/book.entity.js';
import { BookCopy, BookCopySchema } from '../catalog/entities/book-copy.entity.js';
import { User, UserSchema } from '../user/entities/user.entity.js';
import { AdminCirculationController } from './admin-circulation.controller.js';
import { CirculationRepository } from './circulation.repository.js';
import { CirculationService } from './circulation.service.js';
import { Fine, FineSchema } from './entities/fine.entity.js';
import { Loan, LoanSchema } from './entities/loan.entity.js';
import { Notification, NotificationSchema } from './entities/notification.entity.js';
import { Reservation, ReservationSchema } from './entities/reservation.entity.js';
import { MemberCirculationController } from './member-circulation.controller.js';
import { LibrarySettingsModule } from '../settings/library-settings.module.js';
import { CirculationScheduler } from './circulation.scheduler.js';

@Module({
  imports: [
    LibrarySettingsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Book.name, schema: BookSchema },
      { name: BookCopy.name, schema: BookCopySchema },
      { name: Loan.name, schema: LoanSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: Fine.name, schema: FineSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [MemberCirculationController, AdminCirculationController],
  providers: [
    CirculationRepository,
    CirculationService,
    CirculationScheduler,
    AuthGuard,
    RolesGuard,
  ],
})
export class CirculationModule {}
