import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { Role } from '../../enums/role.enum.js';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  toJSON: {
    transform: (_document, value) => {
      Reflect.deleteProperty(value, 'passwordHash');
      Reflect.deleteProperty(value, 'refreshTokenHash');
      Reflect.deleteProperty(value, 'password');
      Reflect.deleteProperty(value, 'refreshToken');
      return value;
    },
  },
})
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  // Old plain-text passwords are removed after the account's next successful login.
  @Prop({ select: false })
  password?: string;

  @Prop({ type: String, enum: Role, default: Role.MEMBER, index: true })
  role: Role;
  
  @Prop({ type: String, index: true })
  memberId:string

  @Prop({ type: String, enum: ['student', 'faculty', 'public'], default: 'student' })
  membershipType: string;

  @Prop({
    type: String,
    enum: ['active', 'suspended', 'expired', 'pending'],
    default: 'active',
  })
  status: string;

  @Prop({ type: Number, default: 0, select: false })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null, select: false })
  loginLockedUntil: Date | null;

  @Prop({ type: String, select: false, default: null })
  refreshTokenHash: string | null;

  @Prop({ select: false })
  refreshToken?: string;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date;

  @Prop({
    type: {
      activeLoans: { type: Number, default: 0 },
      totalBorrowed: { type: Number, default: 0 },
      unpaidFines: { type: Number, default: 0 },
    },
    default: () => ({}),
  })
  stats: { activeLoans: number; totalBorrowed: number; unpaidFines: number };
}

export const UserSchema = SchemaFactory.createForClass(User);
