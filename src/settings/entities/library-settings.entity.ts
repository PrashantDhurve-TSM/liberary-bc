import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { circulationPolicy } from '../../circulation/circulation.policy.js';
import type { CirculationPolicy } from '../../circulation/circulation.policy.js';

export type LibrarySettingsDocument = HydratedDocument<LibrarySettings>;

@Schema({ timestamps: true })
export class LibrarySettings {
  @Prop({ type: String, required: true, unique: true, immutable: true })
  key: string;

  @Prop({ type: Boolean, default: false })
  selfCheckout: boolean;

  @Prop({
    type: {
      student: {
        type: Number,
        default: circulationPolicy.loanDays.student,
        min: 1,
        max: 365,
      },
      faculty: {
        type: Number,
        default: circulationPolicy.loanDays.faculty,
        min: 1,
        max: 365,
      },
      public: {
        type: Number,
        default: circulationPolicy.loanDays.public,
        min: 1,
        max: 365,
      },
    },
    default: () => ({ ...circulationPolicy.loanDays }),
  })
  loanDays: CirculationPolicy['loanDays'];

  @Prop({
    type: {
      student: {
        type: Number,
        default: circulationPolicy.maxActiveLoans.student,
        min: 1,
        max: 100,
      },
      faculty: {
        type: Number,
        default: circulationPolicy.maxActiveLoans.faculty,
        min: 1,
        max: 100,
      },
      public: {
        type: Number,
        default: circulationPolicy.maxActiveLoans.public,
        min: 1,
        max: 100,
      },
    },
    default: () => ({ ...circulationPolicy.maxActiveLoans }),
  })
  maxActiveLoans: CirculationPolicy['maxActiveLoans'];

  @Prop({ type: Number, default: circulationPolicy.maxRenewals, min: 0, max: 10 })
  maxRenewals: number;

  @Prop({ type: Number, default: circulationPolicy.renewDays, min: 1, max: 365 })
  renewDays: number;

  @Prop({ type: Number, default: circulationPolicy.finePerDay, min: 0 })
  finePerDay: number;

  @Prop({ type: Number, default: circulationPolicy.maxFinePerBook, min: 0 })
  maxFinePerBook: number;

  @Prop({
    type: Number,
    default: circulationPolicy.unpaidFineBorrowLimit,
    min: 0,
  })
  unpaidFineBorrowLimit: number;

  @Prop({
    type: Number,
    default: circulationPolicy.reservationHoldHours,
    min: 1,
    max: 720,
  })
  reservationHoldHours: number;

  @Prop({ type: Number, default: circulationPolicy.damagedCharge, min: 0 })
  damagedCharge: number;

  @Prop({ type: Number, default: circulationPolicy.lostCharge, min: 0 })
  lostCharge: number;
}

export const LibrarySettingsSchema =
  SchemaFactory.createForClass(LibrarySettings);
