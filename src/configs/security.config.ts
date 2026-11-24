import { ConfigModule, ConfigService } from '@nestjs/config';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { JwtSignOptions } from '@nestjs/jwt';
import configration from './configration.js';
import {Logger, BadRequestException } from '@nestjs/common';
import type { Connection } from 'mongoose';

export const appConfigModule = {
  isGlobal: true,
  load: [configration],
  envFilePath: '.env',
};

export const validatePipeConfig = {
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: (errors: any) => {
    return new BadRequestException(
      errors.map(
        (err: any) =>
          `${err.property} - ${Object.values(err.constraints).join(', ')}`,
      ),
    );
  },
};

export const corsConfig: CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      '*',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
    ];

    if (!origin) {
      // allow requests with no origin (like mobile apps, curl, Postman)
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // ✅ must be plural
};

export const dbConfig = {
      inject: [ConfigService],
      useFactory: (config: ConfigService) => (
        {
        uri: config.getOrThrow<string>('MONGO_URI'),

        // Connection pool
        maxPoolSize: 10,
        minPoolSize: 2,

        // Fail fast instead of hanging when the server is unreachable
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,

        // Nest retries the first connection before giving up
        retryAttempts: 5,
        retryDelay: 3000,


        // Build indexes automatically in development only
        autoIndex: config.get('NODE_ENV') !== 'production',

        // Log connection state changes
        connectionFactory: (connection: Connection) => {
          const logger = new Logger('MongoDB');
          if (connection.readyState === 1) logger.log('Connected');
          connection.on('connected', () => logger.log('Connected'));
          connection.on('disconnected', () => logger.warn('Disconnected'));
          connection.on('reconnected', () => logger.log('Reconnected'));
          connection.on('error', (err) => logger.error(err.message));
          return connection;
        },
      }
    ),
    }

// export const jwtRegisterConfig = {
//   imports: [ConfigModule],
//   inject: [ConfigService],
//   useFactory: async (config: ConfigService) => ({
//     signOptions: {
//       expiresIn:
//         config.get<JwtSignOptions['expiresIn']>('JWT_EXPIRES_IN') ??
//         '15m',
//     },
//   }),
// };
