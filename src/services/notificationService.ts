import cron from "node-cron";
import { Bot } from "grammy";
import { MemorableDate } from "../db/models/MemorableDate";
import { User } from "../db/models/User";
import { config } from "../config";
import { DATE_TYPE_LABELS, getNextOccurrence } from "./dateService";

function getNotificationKey(
  type: "3days" | "eve" | "day",
  year: number,
  month: number,
): string {
  return `${type}_${year}_${month}`;
}

function getDateLabel(doc: { dateType: string; title: string }): string {
  const typeLabel =
    DATE_TYPE_LABELS[doc.dateType as keyof typeof DATE_TYPE_LABELS] || "📅";
  return `${typeLabel}: <b>${doc.title}</b>`;
}

export function startNotificationScheduler(bot: Bot<any>): void {
  cron.schedule(
    "0 10 * * *",
    async () => {
      await runNotificationCheck(bot);
      await sendDailyDigest(bot);
    },
    {
      timezone: config.timezone,
    },
  );

  console.log(
    `✅ Notification scheduler started (timezone: ${config.timezone})`,
  );
}

export async function runNotificationCheck(bot: Bot<any>): Promise<void> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const allDates = await MemorableDate.find();

  for (const doc of allDates) {
    const next = getNextOccurrence(doc, today);
    if (!next) continue;

    const nextDay = new Date(
      next.getFullYear(),
      next.getMonth(),
      next.getDate(),
    );
    const diffMs = nextDay.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const year = nextDay.getFullYear();
    const month = nextDay.getMonth();

    if (diffDays === 3) {
      await sendIfNotSent(bot, doc, "3days", year, month, async () => {
        const msg = `⏰ Через 3 дня: ${getDateLabel(doc)}\n📅 Дата: ${formatDateStr(next)}`;
        await sendNotification(bot, doc, msg);
      });
    }

    if (diffDays === 1) {
      await sendIfNotSent(bot, doc, "eve", year, month, async () => {
        const msg = `🔔 Завтра: ${getDateLabel(doc)}\n📅 Дата: ${formatDateStr(next)}`;
        await sendNotification(bot, doc, msg);
      });
    }

    if (diffDays === 0) {
      await sendIfNotSent(bot, doc, "day", year, month, async () => {
        const emoji = doc.dateType === "birthday" ? "🎂" : "🎉";
        const msg = `${emoji} Сегодня: ${getDateLabel(doc)}${doc.description ? `\n📝 ${doc.description}` : ""}`;
        await sendNotification(bot, doc, msg);
      });
    }
  }
}

/**
 * Отправляет в групповой чат дайджест публичных дат на сегодня и завтра.
 * Если таких дат нет — ничего не отправляет.
 */
export async function sendDailyDigest(bot: Bot<any>): Promise<void> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const allDates = await MemorableDate.find({ visibility: "public" });

  const todayDates: string[] = [];
  const tomorrowDates: string[] = [];

  for (const doc of allDates) {
    const next = getNextOccurrence(doc, today);
    if (!next) continue;

    const nextDay = new Date(
      next.getFullYear(),
      next.getMonth(),
      next.getDate(),
    );
    const diffMs = nextDay.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const emoji =
        doc.dateType === "birthday"
          ? "🎂"
          : doc.dateType === "reminder"
            ? "🔔"
            : "📅";
      const line = `${emoji} <b>${doc.title}</b>${doc.description ? ` — ${doc.description}` : ""}`;
      todayDates.push(line);
    } else if (diffDays === 1) {
      const emoji =
        doc.dateType === "birthday"
          ? "🎂"
          : doc.dateType === "reminder"
            ? "🔔"
            : "📅";
      const line = `${emoji} <b>${doc.title}</b>${doc.description ? ` — ${doc.description}` : ""}`;
      tomorrowDates.push(line);
    }
  }

  if (todayDates.length === 0 && tomorrowDates.length === 0) return;

  let msg = `📆 <b>Дайджест на ${formatDateStr(today)}</b>\n`;

  if (todayDates.length > 0) {
    msg += `\n🗓 <b>Сегодня:</b>\n`;
    msg += todayDates.map((l) => `  • ${l}`).join("\n");
  }

  if (tomorrowDates.length > 0) {
    msg += `\n\n🗓 <b>Завтра (${formatDateStr(tomorrow)}):</b>\n`;
    msg += tomorrowDates.map((l) => `  • ${l}`).join("\n");
  }

  try {
    await bot.api.sendMessage(config.groupChatId, msg, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to send daily digest:", err);
  }
}

async function sendIfNotSent(
  bot: Bot<any>,
  doc: InstanceType<typeof MemorableDate>,
  type: "3days" | "eve" | "day",
  year: number,
  month: number,
  fn: () => Promise<void>,
): Promise<void> {
  const key = getNotificationKey(type, year, month);
  if (doc.notifiedDays.includes(key)) return;

  await fn();

  doc.notifiedDays.push(key);
  await doc.save();
}

async function sendNotification(
  bot: Bot<any>,
  doc: InstanceType<typeof MemorableDate>,
  message: string,
): Promise<void> {
  try {
    if (doc.visibility === "private") {
      await bot.api.sendMessage(doc.createdBy, message, { parse_mode: "HTML" });
    } else {
      await bot.api.sendMessage(config.groupChatId, message, {
        parse_mode: "HTML",
      });
    }
  } catch (err) {
    console.error(`Failed to send notification for date ${doc._id}:`, err);
  }
}

function formatDateStr(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}
