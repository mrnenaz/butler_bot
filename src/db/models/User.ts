import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'admin' | 'privileged' | 'regular';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    telegramId: { type: Number, required: true, unique: true },
    username: { type: String },
    firstName: { type: String, required: true },
    role: {
      type: String,
      enum: ['admin', 'privileged', 'regular'],
      default: 'regular',
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
