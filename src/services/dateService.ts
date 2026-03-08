import { MemorableDate, IMemorableDate, DateType, RepeatPeriod, DateVisibility } from '../db/models/MemorableDate';
import { UserRole } from '../db/models/User';

export const DATE_TYPE_LABELS: Record<DateType, string> = {
  reminder: '🔔 Напоминание',
  birthday: '🎂 День рождения',
  memorable: '📅 Памятная дата',
};

export const REPEAT_LABELS: Record<RepeatPeriod, string> = {
  once: '1️⃣ Один раз',
  monthly: '📆 Каждый месяц',
  yearly: '🗓 Каждый год',
};

export const VISIBILITY_LABELS: Record<DateVisibility, string> = {
  public: '👥 Общедоступная',
  private: '🔒 Личная',
};

export interface CreateDateInput {
  title: string;
  description?: string;
  date: Date;
  dateType: DateType;
  repeatPeriod: RepeatPeriod;
  visibility: DateVisibility;
  createdBy: number;
}

export async function createDate(input: CreateDateInput): Promise<IMemorableDate> {
  return MemorableDate.create(input);
}

export async function getDatesForUser(
  telegramId: number,
  role: UserRole
): Promise<IMemorableDate[]> {
  if (role === 'admin') {
    return MemorableDate.find().sort({ date: 1 });
  }
  if (role === 'privileged') {
    return MemorableDate.find({
      $or: [
        { visibility: 'public' },
        { createdBy: telegramId },
      ],
    }).sort({ date: 1 });
  }
  // regular
  return MemorableDate.find({ visibility: 'public' }).sort({ date: 1 });
}

export async function getDateById(
  id: string,
  telegramId: number,
  role: UserRole
): Promise<IMemorableDate | null> {
  const doc = await MemorableDate.findById(id);
  if (!doc) return null;

  if (role === 'admin') return doc;
  if (role === 'privileged') {
    if (doc.visibility === 'public' || doc.createdBy === telegramId) return doc;
    return null;
  }
  // regular: only public
  if (doc.visibility === 'public') return doc;
  return null;
}

export async function canEditDate(
  id: string,
  telegramId: number,
  role: UserRole
): Promise<IMemorableDate | null> {
  const doc = await MemorableDate.findById(id);
  if (!doc) return null;

  if (role === 'admin') return doc;
  if (role === 'privileged') {
    if (doc.visibility === 'public' || doc.createdBy === telegramId) return doc;
    return null;
  }
  // regular: only public dates
  if (doc.visibility === 'public') return doc;
  return null;
}

export function formatDate(doc: IMemorableDate): string {
  const d = doc.date;
  const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  let text = `${DATE_TYPE_LABELS[doc.dateType]} <b>${doc.title}</b>\n`;
  text += `📅 Дата: ${dateStr}\n`;
  text += `🔁 Повторение: ${REPEAT_LABELS[doc.repeatPeriod]}\n`;
  text += `${doc.visibility === 'public' ? '👥 Общедоступная' : '🔒 Личная'}\n`;
  if (doc.description) text += `📝 ${doc.description}\n`;
  return text;
}

export function parseDate(input: string): Date | null {
  const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  if (isNaN(date.getTime())) return null;
  return date;
}

// Get next occurrence of date based on repeat period
export function getNextOccurrence(doc: IMemorableDate, now: Date): Date | null {
  const d = new Date(doc.date);

  if (doc.repeatPeriod === 'once') {
    return d > now ? d : null;
  }

  if (doc.repeatPeriod === 'yearly') {
    const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (next <= now) next.setFullYear(next.getFullYear() + 1);
    return next;
  }

  if (doc.repeatPeriod === 'monthly') {
    const next = new Date(now.getFullYear(), now.getMonth(), d.getDate());
    if (next <= now) next.setMonth(next.getMonth() + 1);
    return next;
  }

  return null;
}
