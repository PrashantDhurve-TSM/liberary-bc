import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CatalogService } from './catalog.service.js';

@Controller('categories')
@UseGuards(AuthGuard)
export class CategoryController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  list() {
    return this.catalogService.listCategories();
  }
}
