import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import {
  AddCopiesDto,
  AdminBookListQueryDto,
  CreateBookDto,
  CreateCategoryDto,
  UpdateBookDto,
  UpdateCategoryDto,
  UpdateCopyStatusDto,
} from './dto/catalog.dto.js';
import { CatalogService } from './catalog.service.js';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.LIBRARIAN)
export class AdminCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('books')
  listBooks(@Query() query: AdminBookListQueryDto) {
    return this.catalogService.listAdminBooks(query);
  }

  @Post('books')
  createBook(@Body() data: CreateBookDto) {
    return this.catalogService.createBook(data);
  }

  @Get('books/import-template')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="catalog-import-template.xlsx"',
  )
  downloadImportTemplate() {
    return this.catalogService.createImportTemplate();
  }

  @Get('categories/import-template')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="category-import-template.xlsx"',
  )
  downloadCategoryImportTemplate() {
    return this.catalogService.createCategoryImportTemplate();
  }

  @Post('books/import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
          callback(new BadRequestException('Upload an .xlsx workbook'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  importCatalog(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file) {
      throw new BadRequestException('Choose an .xlsx workbook to import');
    }
    return this.catalogService.importWorkbook(file.buffer);
  }

  @Post('categories/import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
          callback(new BadRequestException('Upload an .xlsx workbook'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  importCategories(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file) {
      throw new BadRequestException('Choose an .xlsx workbook to import');
    }
    return this.catalogService.importWorkbook(file.buffer);
  }

  @Post('books/:id/copies')
  addCopies(@Param('id') id: string, @Body() data: AddCopiesDto) {
    return this.catalogService.addCopies(id, data);
  }

  @Get('books/:id')
  getBook(@Param('id') id: string) {
    return this.catalogService.getAdminBook(id);
  }

  @Patch('books/:id')
  updateBook(@Param('id') id: string, @Body() data: UpdateBookDto) {
    return this.catalogService.updateBook(id, data);
  }

  @Delete('books/:id')
  @Roles(Role.ADMIN)
  archiveBook(@Param('id') id: string) {
    return this.catalogService.archiveBook(id);
  }

  @Patch('copies/:copyId')
  updateCopyStatus(
    @Param('copyId') id: string,
    @Body() data: UpdateCopyStatusDto,
  ) {
    return this.catalogService.updateCopyStatus(id, data.status);
  }

  @Post('categories')
  createCategory(@Body() data: CreateCategoryDto) {
    return this.catalogService.createCategory(data);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() data: UpdateCategoryDto,
  ) {
    return this.catalogService.updateCategory(id, data);
  }

  @Delete('categories/:id')
  @Roles(Role.ADMIN)
  deleteCategory(@Param('id') id: string) {
    return this.catalogService.deleteCategory(id);
  }
}
