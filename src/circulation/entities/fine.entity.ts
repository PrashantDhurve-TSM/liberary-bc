import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type FineDocument = HydratedDocument<Fine>;

export enum FineStatus {
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
  PAID = 'paid',
  WAIVED = 'waived',
}

@Schema({ timestamps: true })
export class Fine {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  member: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Loan' })
  loan?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: { memberName: String, title: String }, required: true })
  snapshot: { memberName: string; title: string };

  @Prop({
    type: String,
    enum: ['overdue', 'damaged', 'lost', 'manual'],
    required: true,
  })
  reason: 'overdue' | 'damaged' | 'lost' | 'manual';

  @Prop({ type: Number, default: 0, min: 0 })
  daysLate: number;

  @Prop({ type: String, maxlength: 500 })
  description?: string;

  @Prop({ type: Number, required: true, min: 0 })
  ratePerDay: number;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  paidAmount: number;

  @Prop({
    type: String,
    enum: FineStatus,
    default: FineStatus.UNPAID,
    index: true,
  })
  status: FineStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  waivedBy?: Types.ObjectId;

  @Prop({ type: String, maxlength: 500 })
  waiveReason?: string;

  @Prop({ type: Date })
  waivedAt?: Date;

  @Prop({ type: Date })
  paidAt?: Date;
}

export const FineSchema = SchemaFactory.createForClass(Fine);
FineSchema.index({ member: 1, status: 1 });
FineSchema.index({ loan: 1 }, { unique: true, sparse: true });
FineSchema.index({ createdAt: -1 });
