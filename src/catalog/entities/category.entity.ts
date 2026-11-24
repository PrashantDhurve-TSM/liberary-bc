import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true, maxlength: 80 })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  bookCount: number;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ name: 1 }, { unique: true });
