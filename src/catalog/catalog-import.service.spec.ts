import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';

describe('catalog workbook import', () => {
  it('creates valid category and book rows and reports invalid rows', async () => {
    const category = { _id: new Types.ObjectId(), name: 'Science' };
    const createBook = vi.fn().mockResolvedValue({});
    const repository = {
      listCategories: vi.fn().mockResolvedValue([]),
      createCategory: vi.fn().mockResolvedValue(category),
      findCategoryById: vi.fn().mockResolvedValue(category),
      createBook,
    } as unknown as CatalogRepository;
    const service = new CatalogService(repository);
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Categories').addRows([
      ['name', 'description'],
      ['Science', 'Science books'],
    ]);
    workbook.addWorksheet('Books').addRows([
      ['title', 'authors', 'category', 'totalCopies'],
      ['A Brief History of Time', 'Stephen Hawking', 'Science', 2],
      ['Invalid book', 'A. Writer', 'Science', 0],
    ]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await service.importWorkbook(buffer);

    expect(result.categoriesCreated).toBe(1);
    expect(result.booksCreated).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ sheet: 'Books', row: 3 }),
    ]);
    expect(createBook).toHaveBeenCalledTimes(1);
  });
});