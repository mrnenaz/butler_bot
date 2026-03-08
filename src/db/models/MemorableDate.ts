import mongoose, { Document, Schema } from 'mongoose';

export type DateType = 'reminder' | 'birthday' | 'memorable';
export type RepeatPeriod = 'once' | 'monthly' | 'yearly';
export type DateVisibility = 'public' | 'private';

export interface IMemorableDate extends Document {
  title: string;
  description?: string;
  date: Date;
  dateType: DateType;
  repeatPeriod: RepeatPeriod;
  visibility: DateVisibility;
  createdBy: number; // telegramId
  notifiedDays: string[]; // track which notifications sent: ['3days_2024', 'eve_2024', 'day_2024']
  createdAt: Date;
  updatedAt: Date;
}

const MemorableDateSchema = new Schema<IMemorableDate>(
  {
    title: { type: String, required: true },
    description: { type: String },
    date: { type: Date, required: true },
    dateType: {
      type: String,
      enum: ['reminder', 'birthday', 'memorable'],
      default: 'memorable',
    },
    repeatPeriod: {
      type: String,
      enum: ['once', 'monthly', 'yearly'],
      required: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    createdBy: { type: Number, required: true },
    notifiedDays: { type: [String], default: [] },
  },
  { timestamps: true }
);

MemorableDateSchema.index({ createdBy: 1 });
MemorableDateSchema.index({ visibility: 1 });

export const MemorableDate = mongoose.model<IMemorableDate>('MemorableDate', MemorableDateSchema);
