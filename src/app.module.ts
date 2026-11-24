import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UserModule } from './user/user.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ConfigModule } from '@nestjs/config';
import { LoggerMiddleware } from './middleware/logger.middleware.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CirculationModule } from './circulation/circulation.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { LibrarySettingsModule } from './settings/library-settings.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    UserModule,
    CatalogModule,
    CirculationModule,
    PaymentsModule,
    OperationsModule,
    LibrarySettingsModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
    }
}
