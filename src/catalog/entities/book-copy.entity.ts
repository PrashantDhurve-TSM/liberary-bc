import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type BookCopyDocument = HydratedDocument<BookCopy>;

export enum BookCopyStatus {
  AVAILABLE = 'available',
  ISSUED = 'issued',
  RESERVED = 'reserved',
  DAMAGED = 'damaged',
  LOST = 'lost',
  WITHDRAWN = 'withdrawn',
}

@Schema({ timestamps: true })
export class BookCopy {
  @Prop({ type: Types.ObjectId, ref: 'Book', required: true, index: true })
  book: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  barcode: string;

  @Prop({
    type: String,
    enum: BookCopyStatus,
    default: BookCopyStatus.AVAILABLE,
    index: true,
  })
  status: BookCopyStatus;

  @Prop({
    type: String,
    enum: ['new', 'good', 'fair', 'poor'],
    default: 'good',
  })
  condition: string;

  @Prop({ type: Types.ObjectId, ref: 'Loan', default: null })
  currentLoan: Types.ObjectId | null;
}

export const BookCopySchema = SchemaFactory.createForClass(BookCopy);
BookCopySchema.index({ book: 1, status: 1 });
