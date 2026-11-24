import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Counter, CounterSchema } from '../user/entities/counter.schema.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';
import { Book, BookSchema } from './entities/book.entity.js';
import { BookCopy, BookCopySchema } from './entities/book-copy.entity.js';
import { Category, CategorySchema } from './entities/category.entity.js';
import { CategoryController } from './category.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: BookCopy.name, schema: BookCopySchema },
      { name: Category.name, schema: CategorySchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  controllers: [
    CatalogController,
    CategoryController,
    AdminCatalogController,
  ],
  providers: [CatalogRepository, CatalogService, AuthGuard, RolesGuard],
  exports: [CatalogService],
})
export class CatalogModule {}
