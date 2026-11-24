import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import {
  AddCopiesDto,
  AdminBookListQueryDto,
  BookListQueryDto,
  CreateBookDto,
  CreateCategoryDto,
  UpdateBookDto,
  UpdateCategoryDto,
} from './dto/catalog.dto.js';
import { BookCopyStatus } from './entities/book-copy.entity.js';
import { CatalogRepository, type BookFilters } from './catalog.repository.js';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async createImportTemplate() {
    const workbook = new ExcelJS.Workbook();
    workbook
      .addWorksheet('Books')
      .addRow([
        'title',
        'authors',
        'isbn',
        'category',
        'totalCopies',
        'publishedYear',
        'publisher',
        'language',
        'pages',
        'description',
        'coverUrl',
        'tags',
        'shelfLocation',
      ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async createCategoryImportTemplate() {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Categories').addRow(['name', 'description']);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importWorkbook(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer,
      );
    } catch {
      throw new BadRequestException('The uploaded file is not a valid .xlsx workbook');
    }

    const categoriesSheet = workbook.worksheets.find(
      (sheet) => sheet.name.toLowerCase() === 'categories',
    );
    const booksSheet = workbook.worksheets.find(
      (sheet) => sheet.name.toLowerCase() === 'books',
    );
    if (!categoriesSheet && !booksSheet) {
      throw new BadRequestException(
        'Workbook must contain a Categories or Books sheet',
      );
    }

    const categoryColumns = categoriesSheet ? this.importColumns(categoriesSheet) : new Map<string, number>();
    const bookColumns = booksSheet ? this.importColumns(booksSheet) : new Map<string, number>();
    if (categoriesSheet) this.requireImportColumns(categoryColumns, ['name']);
    if (booksSheet) this.requireImportColumns(bookColumns, ['title', 'authors', 'category', 'totalcopies']);
    if ((categoriesSheet?.rowCount ?? 0) > 1001 || (booksSheet?.rowCount ?? 0) > 1001) {
      throw new BadRequestException('Each sheet can contain at most 1,000 data rows');
    }

    const result = {
      categoriesCreated: 0,
      booksCreated: 0,
      errors: [] as { sheet: string; row: number; message: string }[],
    };
    const categoryIds = new Map<string, string>();
    const existingCategories = await this.repository.listCategories();
    for (const category of existingCategories) {
      categoryIds.set(this.categoryKey(category.name), category._id.toString());
    }
    const seenCategoryRows = new Set<string>();

    if (categoriesSheet) for (let rowNumber = 2; rowNumber <= categoriesSheet.rowCount; rowNumber += 1) {
      const row = categoriesSheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      const name = this.importCell(row, categoryColumns, 'name');
      const description = this.importCell(row, categoryColumns, 'description');
      if (!name) continue;

      const key = this.categoryKey(name);
      if (seenCategoryRows.has(key)) {
        result.errors.push({
          sheet: 'Categories',
          row: rowNumber,
          message: `Duplicate category name: ${name}`,
        });
        continue;
      }
      seenCategoryRows.add(key);
      if (categoryIds.has(key)) continue;

      const categoryDto = plainToInstance(CreateCategoryDto, {
        name,
        ...(description ? { description } : {}),
      });
      const validationMessages = await this.importValidationMessages(categoryDto);
      if (validationMessages) {
        result.errors.push({ sheet: 'Categories', row: rowNumber, message: validationMessages });
        continue;
      }

      try {
        const category = await this.createCategory(categoryDto);
        categoryIds.set(key, category._id.toString());
        result.categoriesCreated += 1;
      } catch (error) {
        result.errors.push({
          sheet: 'Categories',
          row: rowNumber,
          message: this.importErrorMessage(error),
        });
      }
    }

    if (booksSheet) for (let rowNumber = 2; rowNumber <= booksSheet.rowCount; rowNumber += 1) {
      const row = booksSheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      const title = this.importCell(row, bookColumns, 'title');
      const categoryName = this.importCell(row, bookColumns, 'category');
      if (!title && !categoryName) continue;
      const categoryId = categoryIds.get(this.categoryKey(categoryName));
      if (!categoryId) {
        result.errors.push({
          sheet: 'Books',
          row: rowNumber,
          message: `Category not found: ${categoryName || '(blank)'}`,
        });
        continue;
      }

      const authors = this.importList(this.importCell(row, bookColumns, 'authors'));
      const isbn = this.importCell(row, bookColumns, 'isbn');
      const publishedYear = this.importCell(row, bookColumns, 'publishedyear');
      const pages = this.importCell(row, bookColumns, 'pages');
      const description = this.importCell(row, bookColumns, 'description');
      const coverUrl = this.importCell(row, bookColumns, 'coverurl');
      const publisher = this.importCell(row, bookColumns, 'publisher');
      const language = this.importCell(row, bookColumns, 'language');
      const shelfLocation = this.importCell(row, bookColumns, 'shelflocation');
      const tags = this.importList(this.importCell(row, bookColumns, 'tags'));
      const bookDto = plainToInstance(CreateBookDto, {
        title,
        authors,
        category: categoryId,
        totalCopies: this.importCell(row, bookColumns, 'totalcopies'),
        ...(isbn ? { isbn } : {}),
        ...(publishedYear ? { publishedYear } : {}),
        ...(pages ? { pages } : {}),
        ...(description ? { description } : {}),
        ...(coverUrl ? { coverUrl } : {}),
        ...(publisher ? { publisher } : {}),
        ...(language ? { language } : {}),
        ...(shelfLocation ? { shelfLocation } : {}),
        ...(tags.length ? { tags } : {}),
      });
      const validationMessages = await this.importValidationMessages(bookDto);
      if (validationMessages) {
        result.errors.push({ sheet: 'Books', row: rowNumber, message: validationMessages });
        continue;
      }

      try {
        await this.createBook(bookDto);
        result.booksCreated += 1;
      } catch (error) {
        result.errors.push({
          sheet: 'Books',
          row: rowNumber,
          message: this.importErrorMessage(error),
        });
      }
    }

    return result;
  }

  async listBooks(query: BookListQueryDto) {
    const categoryId = await this.resolveCategoryId(query.category);
    if (query.category && !categoryId) {
      return this.emptyPage(query.page, query.limit);
    }

    return this.repository.listBooks({
      ...this.pagination(query),
      q: query.q?.trim(),
      categoryId,
      availability: query.availability,
      year: query.year,
      sort: query.sort,
      status: 'active',
    });
  }

  async listAdminBooks(query: AdminBookListQueryDto) {
    const categoryId = await this.resolveCategoryId(query.category);
    if (query.category && !categoryId) {
      return this.emptyPage(query.page, query.limit);
    }

    return this.repository.listBooks(
      {
        ...this.pagination(query),
        q: query.q?.trim(),
        categoryId,
        availability: query.availability,
        year: query.year,
        sort: query.sort,
        status: query.status ?? 'active',
      },
      true,
    );
  }

  async getNewArrivals(limit = 8) {
    const books = await this.repository.listNewArrivals(
      this.clampInteger(limit, 8, 1, 24),
    );
    return books.map(({ _id, ...book }) => ({ id: _id.toString(), ...book }));
  }

  async getBook(id: string) {
    this.assertObjectId(id);
    const book = await this.repository.findBookById(id);
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    const { _id, ...details } = book;
    return { id: _id.toString(), ...details };
  }

  async getAdminBook(id: string) {
    this.assertObjectId(id);
    const [book, copies] = await Promise.all([
      this.repository.findBookById(id, true),
      this.repository.findCopies(new Types.ObjectId(id)),
    ]);
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    const { _id, ...details } = book;
    return { id: _id.toString(), ...details, copies };
  }

  async createBook(data: CreateBookDto) {
    const category = await this.repository.findCategoryById(data.category);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    try {
      return await this.repository.createBook(
        this.normalizeBookInput(data),
        category,
      );
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          error.keyPattern?.isbn
            ? 'A book with this ISBN already exists'
            : 'A book or copy with this identifier already exists',
        );
      }
      throw error;
    }
  }

  async updateBook(id: string, data: UpdateBookDto) {
    this.assertObjectId(id);
    const category = data.category
      ? await this.repository.findCategoryById(data.category)
      : undefined;
    if (data.category && !category) {
      throw new NotFoundException('Category not found');
    }

    try {
      const book = await this.repository.updateBook(
        id,
        this.normalizeBookInput(data),
        category ?? undefined,
      );
      if (!book) {
        throw new NotFoundException('Book not found');
      }
      return book;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('A book with this ISBN already exists');
      }
      throw error;
    }
  }

  async archiveBook(id: string) {
    this.assertObjectId(id);
    const result = await this.repository.archiveBook(id);
    if (!result) {
      throw new NotFoundException('Book not found');
    }
    if (result.blocked) {
      throw new ConflictException(
        'A book with an issued or reserved copy cannot be archived',
      );
    }
    return { message: 'Book archived' };
  }

  async addCopies(id: string, data: AddCopiesDto) {
    this.assertObjectId(id);
    const result = await this.repository.addCopies(id, data.count);
    if (!result) {
      throw new NotFoundException('Active book not found');
    }
    return result;
  }

  async updateCopyStatus(id: string, status: BookCopyStatus) {
    this.assertObjectId(id);
    const copy = await this.repository.updateCopyStatus(id, status);
    if (!copy) {
      throw new NotFoundException('Book copy not found');
    }
    if ('blocked' in copy && copy.blocked) {
      throw new ConflictException(
        'Issued or reserved copies must be changed through circulation',
      );
    }
    return copy;
  }

  listCategories() {
    return this.repository.listCategories().then((categories) =>
      categories.map(({ _id, ...category }) => ({
        id: _id.toString(),
        ...category,
      })),
    );
  }

  async createCategory(data: CreateCategoryDto) {
    const slug = this.slugify(data.name);
    try {
      const category = await this.repository.createCategory(
        { ...data, name: data.name.trim() },
        slug,
      );
      return category;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }
  }

  async updateCategory(id: string, data: UpdateCategoryDto) {
    this.assertObjectId(id);
    try {
      const category = await this.repository.updateCategory(
        id,
        {
          ...data,
          ...(data.name ? { name: data.name.trim() } : {}),
        },
        data.name ? this.slugify(data.name) : undefined,
      );
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      return category;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }
  }

  async deleteCategory(id: string) {
    this.assertObjectId(id);
    const result = await this.repository.deleteCategory(id);
    if (!result) {
      throw new NotFoundException('Category not found');
    }
    if (result.blocked) {
      throw new ConflictException('A category containing books cannot be deleted');
    }
    return { message: 'Category deleted' };
  }

  private async resolveCategoryId(category?: string) {
    const value = category?.trim();
    if (!value) {
      return undefined;
    }

    if (Types.ObjectId.isValid(value)) {
      return (await this.repository.findCategoryById(value))?._id.toString();
    }

    // The public API accepts a category slug. Normalize it once here so
    // values such as "Computer Science" and "computer_science" resolve to
    // the same category before the books query is built.
    const slug = this.slugify(value);
    const categoryRecord = await this.repository.findCategoryBySlug(slug);
    return categoryRecord?._id.toString();
  }

  private importColumns(worksheet: ExcelJS.Worksheet) {
    const columns = new Map<string, number>();
    worksheet.getRow(1).eachCell((cell, column) => {
      const name = cell.text.trim().toLowerCase().replace(/[\s_-]+/g, '');
      if (name) columns.set(name, column);
    });
    return columns;
  }

  private requireImportColumns(columns: Map<string, number>, required: string[]) {
    const missing = required.filter((name) => !columns.has(name));
    if (missing.length) {
      throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
    }
  }

  private importCell(
    row: ExcelJS.Row,
    columns: Map<string, number>,
    name: string,
  ) {
    const column = columns.get(name);
    return column ? row.getCell(column).text.trim() : '';
  }

  private importList(value: string) {
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  }

  private categoryKey(name: string) {
    return name.trim().toLocaleLowerCase();
  }

  private async importValidationMessages(value: object) {
    const errors = await validate(value);
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    return messages.length ? messages.join('; ') : '';
  }

  private importErrorMessage(error: unknown) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      return error.message;
    }
    return 'Unable to insert this row';
  }

  private pagination(query: BookListQueryDto): Pick<BookFilters, 'page' | 'limit'> {
    return {
      page: this.clampInteger(query.page, 1, 1, 100000),
      limit: this.clampInteger(query.limit, 20, 1, 100),
    };
  }

  private emptyPage(page = 1, limit = 20) {
    const safePage = this.clampInteger(page, 1, 1, 100000);
    const safeLimit = this.clampInteger(limit, 20, 1, 100);
    return {
      data: [],
      meta: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 },
    };
  }

  private normalizeBookInput(data: CreateBookDto): CreateBookDto;
  private normalizeBookInput(data: UpdateBookDto): UpdateBookDto;
  private normalizeBookInput(
    data: CreateBookDto | UpdateBookDto,
  ): CreateBookDto | UpdateBookDto {
    return {
      ...data,
      ...(data.title ? { title: data.title.trim() } : {}),
      ...(data.authors
        ? { authors: data.authors.map((author) => author.trim()) }
        : {}),
      ...(data.isbn ? { isbn: data.isbn.replace(/[-\s]/g, '') } : {}),
      ...(data.tags ? { tags: data.tags.map((tag) => tag.trim()) } : {}),
    };
  }

  private slugify(value: string): string {
    const slug = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) {
      throw new BadRequestException('Category name must contain letters or numbers');
    }
    return slug;
  }

  private assertObjectId(id: string): void {
    if (!/^[\da-f]{24}$/i.test(id)) {
      throw new BadRequestException('Invalid identifier');
    }
  }

  private clampInteger(value: number, fallback: number, min: number, max: number) {
    return Number.isInteger(value)
      ? Math.min(Math.max(value, min), max)
      : fallback;
  }

  private isDuplicateKeyError(
    error: unknown,
  ): error is { code: number; keyPattern?: Record<string, unknown> } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
