import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

export enum PaymentMethod {
  DEMO = 'demo',
  CASH = 'cash',
}

export enum PaymentStatus {
  PAID = 'paid',
}

@Schema({ _id: false })
export class PaymentAllocation {
  @Prop({ type: Types.ObjectId, ref: 'Fine', required: true })
  fine: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  amount: number;
}
export const PaymentAllocationSchema =
  SchemaFactory.createForClass(PaymentAllocation);

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  member: Types.ObjectId;

  @Prop({ type: String, required: true })
  memberName: string;

  @Prop({ type: [PaymentAllocationSchema], required: true })
  allocations: PaymentAllocation[];

  @Prop({ type: Number, required: true, min: 1 })
  amount: number;

  @Prop({ type: String, enum: PaymentMethod, required: true })
  method: PaymentMethod;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.PAID,
    index: true,
  })
  status: PaymentStatus;

  @Prop({ type: String })
  idempotencyKey?: string;

  @Prop({ type: String, unique: true, sparse: true })
  receiptNo?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  collectedBy?: Types.ObjectId;

  @Prop({ type: Date })
  paidAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index(
  { member: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
PaymentSchema.index({ member: 1, createdAt: -1 });
