import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger, ValidationPipe } from '@nestjs/common';
import { corsConfig, validatePipeConfig } from './configs/security.config.js';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService)
  const PORT = config.get<number>('PORT') ?? 3000
  const logger = new Logger('Dev-logs');

  app.setGlobalPrefix('/api')
  app.enableCors(corsConfig);
  
  app.useGlobalPipes(new ValidationPipe(validatePipeConfig))
  app.useGlobalFilters(new AllExceptionsFilter(),new HttpExceptionFilter())

  await app.listen(PORT);
  
  logger.log(`THE SERVCER IS LISTNING IN http://localhost:${PORT}` )
}
await bootstrap();
