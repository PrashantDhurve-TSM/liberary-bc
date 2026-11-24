import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { Counter } from '../user/entities/counter.schema.js';
import { Book, type BookDocument } from './entities/book.entity.js';
import { BookCopy, BookCopyStatus } from './entities/book-copy.entity.js';
import { Category } from './entities/category.entity.js';
import type {
  CreateBookDto,
  CreateCategoryDto,
  UpdateBookDto,
  UpdateCategoryDto,
} from './dto/catalog.dto.js';

export interface BookFilters {
  q?: string;
  categoryId?: string;
  availability?: 'available' | 'all';
  year?: number;
  sort?: 'title' | '-createdAt' | '-rating.avg' | '-borrowCount';
  page: number;
  limit: number;
  status?: 'active' | 'archived' | 'all';
}

type CategorySnapshot = Pick<Category, 'name'> & { _id: Types.ObjectId };

@Injectable()
export class CatalogRepository {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
    @InjectModel(BookCopy.name) private readonly copyModel: Model<BookCopy>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Counter.name) private readonly counterModel: Model<Counter>,
  ) {}

  async listBooks(filters: BookFilters, includeAdminFields = false) {
    const statusFilter:
      | Book['status']
      | { $in: Book['status'][] } =
      includeAdminFields && filters.status === 'all'
        ? { $in: ['active', 'archived'] }
        : includeAdminFields && filters.status === 'archived'
          ? 'archived'
          : 'active';
    const filter = {
      status: statusFilter,
      ...(filters.q ? { $text: { $search: filters.q } } : {}),
      // Some existing book records store category as a string while newer
      // records use ObjectId. Compare the normalized string value so both
      // formats work with the public category slug filter.
      ...(filters.categoryId
        ? {
            $expr: {
              $eq: [{ $toString: '$category' }, filters.categoryId],
            },
          }
        : {}),
      ...(filters.availability === 'available'
        ? { availableCopies: { $gt: 0 } }
        : {}),
      ...(filters.year !== undefined
        ? { publishedYear: filters.year }
        : {}),
    };

    const sortField = filters.sort ?? '-createdAt';
    const sort = sortField.startsWith('-')
      ? { [sortField.slice(1)]: -1 as const }
      : { [sortField]: 1 as const };
    const projection = includeAdminFields
      ? 'bookId title authors isbn categoryName coverUrl totalCopies availableCopies rating status publishedYear shelfLocation'
      : 'title authors categoryName coverUrl availableCopies rating publishedYear';
    const skip = (filters.page - 1) * filters.limit;
    const [books, total] = await Promise.all([
      this.bookModel
        .find(filter)
        .select(projection)
        .sort(sort)
        .skip(skip)
        .limit(filters.limit)
        .lean()
        .exec(),
      this.bookModel.countDocuments(filter).exec(),
    ]);

    return {
      data: books.map(({ _id, ...book }) => ({ id: _id.toString(), ...book })),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  listNewArrivals(limit: number) {
    return this.bookModel
      .find({ status: 'active' })
      .select('title authors categoryName coverUrl availableCopies createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  findCategoryById(id: string) {
    return this.categoryModel.findById(id).lean().exec();
  }

  findCategoryBySlug(slug: string) {
    // Older category records may not have a slug (or may have been saved
    // with the display name only). Accept the public slug in either form so
    // category filtering does not depend on when the category was created.
    const namePattern = `^${slug
      .split('-')
      .filter(Boolean)
      .map((part) => part.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'))
      .join('[-_\\s]+')}$`;
    return this.categoryModel
      .findOne({
        $or: [
          { slug: slug.toLowerCase() },
          { slug: { $regex: namePattern, $options: 'i' } },
          { name: { $regex: namePattern, $options: 'i' } },
        ],
      })
      .lean()
      .exec();
  }

  listCategories() {
    return this.categoryModel
      .find()
      .select('name slug description bookCount')
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  findBookById(id: string, includeArchived = false) {
    return this.bookModel
      .findOne({
        _id: id,
        ...(includeArchived ? {} : { status: 'active' }),
      })
      .select('-__v')
      .lean()
      .exec();
  }

  findCopies(bookId: Types.ObjectId) {
    return this.copyModel
      .find({ book: bookId })
      .select('barcode status condition')
      .sort({ barcode: 1 })
      .lean()
      .exec();
  }

  async createBook(data: CreateBookDto, category: CategorySnapshot) {
    const sequence = await this.nextSequence('book');
    const bookId = `B-${String(sequence).padStart(4, '0')}`;
    const book = await this.bookModel.create({
      ...data,
      bookId,
      category: category._id,
      categoryName: category.name,
      totalCopies: data.totalCopies,
      availableCopies: data.totalCopies,
    });

    try {
      await this.counterModel.create({
        name: this.copyCounterName(bookId),
        seq: data.totalCopies,
      });
      const copies = await this.copyModel.insertMany(
        this.newCopies(book._id, bookId, 0, data.totalCopies),
      );
      await this.categoryModel
        .updateOne({ _id: category._id }, { $inc: { bookCount: 1 } })
        .exec();
      return {
        id: book._id.toString(),
        bookId,
        totalCopies: book.totalCopies,
        copies: copies.map((copy) => copy.barcode),
      };
    } catch (error) {
      await this.copyModel.deleteMany({ book: book._id }).exec();
      await this.counterModel
        .deleteOne({ name: this.copyCounterName(bookId) })
        .exec();
      await this.bookModel.deleteOne({ _id: book._id }).exec();
      throw error;
    }
  }

  async updateBook(
    id: string,
    data: UpdateBookDto,
    category?: CategorySnapshot,
  ) {
    const existing = await this.bookModel.findById(id).exec();
    if (!existing) {
      return null;
    }

    const previousCategoryId = existing.category.toString();
    const updated = await this.bookModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            ...data,
            ...(category
              ? { category: category._id, categoryName: category.name }
              : {}),
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (
      category &&
      existing.status === 'active' &&
      previousCategoryId !== category._id.toString()
    ) {
      await Promise.all([
        this.categoryModel
          .updateOne({ _id: previousCategoryId }, { $inc: { bookCount: -1 } })
          .exec(),
        this.categoryModel
          .updateOne({ _id: category._id }, { $inc: { bookCount: 1 } })
          .exec(),
      ]);
    }
    return updated;
  }

  async archiveBook(id: string) {
    const book = await this.bookModel.findById(id).exec();
    if (!book) {
      return null;
    }

    const openCopies = await this.copyModel
      .countDocuments({
        book: book._id,
        status: { $in: [BookCopyStatus.ISSUED, BookCopyStatus.RESERVED] },
      })
      .exec();
    if (openCopies > 0) {
      return { blocked: true as const };
    }

    const archived = await this.bookModel
      .updateOne(
        { _id: book._id, status: 'active' },
        { $set: { status: 'archived' } },
      )
      .exec();
    if (archived.modifiedCount > 0) {
      await this.categoryModel
        .updateOne({ _id: book.category }, { $inc: { bookCount: -1 } })
        .exec();
    }
    return { blocked: false as const };
  }

  async addCopies(id: string, count: number) {
    const book = await this.bookModel
      .findOneAndUpdate(
        { _id: id, status: 'active' },
        { $inc: { totalCopies: count, availableCopies: count } },
        { returnDocument: 'after'},
      )
      .exec();
    if (!book) {
      return null;
    }

    let firstNewCopy: number | undefined;
    try {
      firstNewCopy = await this.allocateCopyRange(book, count);
      const copies = await this.copyModel.insertMany(
        this.newCopies(book._id, book.bookId, firstNewCopy, count),
      );
      return {
        totalCopies: book.totalCopies,
        copies: copies.map((copy) => copy.barcode),
      };
    } catch (error) {
      const allocatedFrom = firstNewCopy;
      if (allocatedFrom !== undefined) {
        await this.copyModel
          .deleteMany({
            book: book._id,
            barcode: {
              $in: Array.from({ length: count }, (_, index) =>
                `${book.bookId}-${allocatedFrom + index + 1}`,
              ),
            },
          })
          .exec();
      }
      await this.bookModel
        .updateOne(
          { _id: book._id },
          { $inc: { totalCopies: -count, availableCopies: -count } },
        )
        .exec();
      throw error;
    }
  }

  async updateCopyStatus(id: string, status: BookCopyStatus) {
    const copy = await this.copyModel.findById(id).exec();
    if (!copy) {
      return null;
    }
    if (
      copy.status === BookCopyStatus.ISSUED ||
      copy.status === BookCopyStatus.RESERVED
    ) {
      return { blocked: true as const };
    }

    const updated = await this.copyModel
      .findOneAndUpdate(
        { _id: copy._id, status: copy.status },
        { $set: { status } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!updated) {
      return { blocked: true as const };
    }

    const availableDelta =
      Number(status === BookCopyStatus.AVAILABLE) -
      Number(copy.status === BookCopyStatus.AVAILABLE);
    const totalDelta =
      Number(status !== BookCopyStatus.WITHDRAWN) -
      Number(copy.status !== BookCopyStatus.WITHDRAWN);
    if (availableDelta !== 0 || totalDelta !== 0) {
      await this.bookModel
        .updateOne(
          { _id: copy.book },
          {
            $inc: {
              availableCopies: availableDelta,
              totalCopies: totalDelta,
            },
          },
        )
        .exec();
    }
    return updated;
  }

  async createCategory(data: CreateCategoryDto, slug: string) {
    return this.categoryModel.create({ ...data, slug });
  }

  async updateCategory(
    id: string,
    data: UpdateCategoryDto,
    slug?: string,
  ) {
    const category = await this.categoryModel
      .findByIdAndUpdate(
        id,
        { $set: { ...data, ...(slug ? { slug } : {}) } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (category && data.name) {
      await this.bookModel
        .updateMany(
          { category: category._id },
          { $set: { categoryName: category.name } },
        )
        .exec();
    }
    return category;
  }

  async deleteCategory(id: string) {
    const bookCount = await this.bookModel.countDocuments({ category: id }).exec();
    if (bookCount > 0) {
      return { blocked: true as const };
    }
    const category = await this.categoryModel.findByIdAndDelete(id).exec();
    return category ? { blocked: false as const } : null;
  }

  private async nextSequence(name: string): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { name },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!counter) {
      throw new Error(`Unable to allocate ${name} ID`);
    }
    return counter.seq;
  }

  private async allocateCopyRange(
    book: BookDocument,
    count: number,
  ): Promise<number> {
    const name = this.copyCounterName(book.bookId);
    const existingCounter = await this.counterModel.findOne({ name }).exec();
    if (!existingCounter) {
      const currentCopyCount = await this.copyModel
        .countDocuments({ book: book._id })
        .exec();
      try {
        await this.counterModel.create({ name, seq: currentCopyCount });
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    const counter = await this.counterModel
      .findOneAndUpdate(
        { name },
        { $inc: { seq: count } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!counter) {
      throw new Error(`Unable to allocate copy barcodes for ${book.bookId}`);
    }
    return counter.seq - count;
  }

  private copyCounterName(bookId: string): string {
    return `copies:${bookId}`;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private newCopies(
    bookId: Types.ObjectId,
    readableBookId: string,
    startingAt: number,
    count: number,
  ) {
    return Array.from({ length: count }, (_, index) => ({
      book: bookId,
      barcode: `${readableBookId}-${startingAt + index + 1}`,
      status: BookCopyStatus.AVAILABLE,
    }));
  }
}
