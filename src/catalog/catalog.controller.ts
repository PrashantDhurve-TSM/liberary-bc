import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { BookListQueryDto } from './dto/catalog.dto.js';
import { CatalogService } from './catalog.service.js';

@Controller('books')
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('new-arrivals')
  newArrivals(@Query('limit') limit?: string) {
    const parsedLimit = limit === undefined ? 8 : Number(limit);
    return this.catalogService.getNewArrivals(parsedLimit);
  }

  @Get()
  list(@Query() query: BookListQueryDto) {
    return this.catalogService.listBooks(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalogService.getBook(id);
  }
}
