import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { Role } from '../../enums/role.enum.js';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  actor: Types.ObjectId;

  @Prop({ type: String, enum: Role, required: true })
  actorRole: Role;

  @Prop({ type: String, required: true, maxlength: 12 })
  method: string;

  @Prop({ type: String, required: true, maxlength: 200 })
  resource: string;

  @Prop({ type: String, maxlength: 100 })
  resourceId?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
