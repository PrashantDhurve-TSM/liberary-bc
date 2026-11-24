import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type ReservationDocument = HydratedDocument<Reservation>;

export enum ReservationStatus {
  WAITING = 'waiting',
  READY = 'ready',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true })
export class Reservation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  member: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Book', required: true, index: true })
  book: Types.ObjectId;

  @Prop({ type: { memberName: String, title: String }, required: true })
  snapshot: { memberName: string; title: string };

  @Prop({ type: Number, required: true, min: 1 })
  queuePosition: number;

  @Prop({
    type: String,
    enum: ReservationStatus,
    default: ReservationStatus.WAITING,
    index: true,
  })
  status: ReservationStatus;

  @Prop({ type: Date })
  notifiedAt?: Date;

  @Prop({ type: Date })
  holdUntil?: Date;

  @Prop({ type: Types.ObjectId, ref: 'BookCopy' })
  copy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Loan' })
  fulfilledLoan?: Types.ObjectId;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);
ReservationSchema.index(
  { member: 1, book: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [ReservationStatus.WAITING, ReservationStatus.READY] },
    },
  },
);
ReservationSchema.index({ book: 1, status: 1, queuePosition: 1 });
