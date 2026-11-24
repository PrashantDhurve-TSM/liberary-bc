import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type BookDocument = HydratedDocument<Book>;

@Schema({ timestamps: true })
export class Book {
  @Prop({ required: true, unique: true, index: true })
  bookId: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: [String], required: true })
  authors: string[];

  @Prop({ unique: true, sparse: true, trim: true })
  isbn?: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  category: Types.ObjectId;

  @Prop({ required: true, trim: true })
  categoryName: string;

  @Prop({ trim: true, maxlength: 160 })
  publisher?: string;

  @Prop({ type: Number, min: 1, max: 9999 })
  publishedYear?: number;

  @Prop({ trim: true, default: 'English', maxlength: 50 })
  language: string;

  @Prop({ type: Number, min: 1 })
  pages?: number;

  @Prop({ trim: true, maxlength: 10000 })
  description?: string;

  @Prop({ trim: true, maxlength: 2048 })
  coverUrl?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ trim: true, maxlength: 80 })
  shelfLocation?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  totalCopies: number;

  @Prop({ type: Number, default: 0, min: 0 })
  availableCopies: number;

  @Prop({ type: Number, default: 0, min: 0 })
  reservationCount: number;

  @Prop({ type: Number, default: 0, min: 0, index: true })
  borrowCount: number;

  @Prop({
    type: {
      avg: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
    },
    default: () => ({ avg: 0, count: 0 }),
  })
  rating: { avg: number; count: number };

  @Prop({ type: String, enum: ['active', 'archived'], default: 'active', index: true })
  status: 'active' | 'archived';
}

export const BookSchema = SchemaFactory.createForClass(Book);
BookSchema.index(
  { title: 'text', authors: 'text', isbn: 'text', tags: 'text' },
  { weights: { title: 10, authors: 5, tags: 2 } },
);
BookSchema.index({ category: 1, availableCopies: -1 });
BookSchema.index({ status: 1, createdAt: -1 });
