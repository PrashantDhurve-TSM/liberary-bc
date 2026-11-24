import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type LoanDocument = HydratedDocument<Loan>;

export enum LoanStatus {
  PENDING = 'pending',
  ISSUED = 'issued',
  OVERDUE = 'overdue',
  RETURNED = 'returned',
  LOST = 'lost',
}

@Schema({ timestamps: true })
export class Loan {
  declare updatedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  member: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Book', required: true, index: true })
  book: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'BookCopy', required: true })
  copy: Types.ObjectId;

  @Prop({
    type: {
      memberName: String,
      memberId: String,
      title: String,
      authors: [String],
      barcode: String,
    },
    required: true,
  })
  snapshot: {
    memberName: string;
    memberId: string;
    title: string;
    authors: string[];
    barcode: string;
  };

  @Prop({ type: Date, default: null })
  issuedAt: Date | null;

  @Prop({ type: Date, default: null, index: true })
  dueAt: Date | null;

  @Prop({ type: Date })
  returnedAt?: Date;

  @Prop({ type: Number, default: 0, min: 0 })
  renewCount: number;

  @Prop({ type: Number, default: 2, min: 0 })
  maxRenewals: number;

  @Prop({
    type: String,
    enum: LoanStatus,
    default: LoanStatus.ISSUED,
    index: true,
  })
  status: LoanStatus;

  @Prop({ type: String, enum: ['good', 'damaged', 'lost'] })
  returnCondition?: 'good' | 'damaged' | 'lost';

  @Prop({ type: Types.ObjectId, ref: 'User' })
  issuedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  returnedTo?: Types.ObjectId;

  @Prop({ type: Date })
  returnRequestedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Fine' })
  fine?: Types.ObjectId;

  @Prop({
    type: [
      {
        renewedAt: Date,
        oldDueAt: Date,
        newDueAt: Date,
      },
    ],
    default: [],
  })
  renewals: Array<{ renewedAt: Date; oldDueAt: Date; newDueAt: Date }>;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);
LoanSchema.index({ member: 1, status: 1 });
LoanSchema.index({ status: 1, dueAt: 1 });
LoanSchema.index(
  { copy: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [LoanStatus.PENDING, LoanStatus.ISSUED, LoanStatus.OVERDUE] },
    },
  },
);
