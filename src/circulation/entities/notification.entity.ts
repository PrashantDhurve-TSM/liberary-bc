import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({
    type: String,
    enum: [
      'due_soon',
      'overdue',
      'reservation_ready',
      'fine_added',
      'payment_success',
      'account',
      'general',
    ],
    required: true,
  })
  type: string;

  @Prop({ required: true, maxlength: 120 })
  title: string;

  @Prop({ required: true, maxlength: 1000 })
  message: string;

  @Prop({ maxlength: 200 })
  link?: string;

  @Prop({ type: [String], enum: ['in_app', 'email', 'sms'], default: ['in_app'] })
  channels: string[];

  @Prop({ type: Boolean, default: false, index: true })
  read: boolean;

  @Prop({ type: Date, default: Date.now })
  sentAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
