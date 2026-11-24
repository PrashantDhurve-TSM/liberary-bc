import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { MeController } from './me.controller.js';
import { User, UserSchema } from './entities/user.entity.js';
import { PassportModule } from '@nestjs/passport';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Counter, CounterSchema } from './entities/counter.schema.js';
import { UserRepository } from './user.repository.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    PassportModule,
  ],
  controllers: [UserController, MeController],
  providers: [UserRepository, UserService, AuthGuard, RolesGuard],
  exports: [UserService],
})
export class UserModule {}
