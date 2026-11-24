import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { dbConfig } from '../configs/security.config.js';


@Module({
  imports: [
    MongooseModule.forRootAsync(dbConfig),
  ],
})
export class DatabaseModule {}
