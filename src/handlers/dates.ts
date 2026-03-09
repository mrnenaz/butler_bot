import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { SessionData, initialSession } from "../types/session";
import { getOrCreateUser, requireRole } from "../middlewares/roles";
import {
  createDate,
  getDatesForUser,
  canEditDate,
  formatDate,
  parseDate,
  DATE_TYPE_LABELS,
  REPEAT_LABELS,
  VISIBILITY_LABELS,
} from "../services/dateService";
import { MemorableDate } from "../db/models/MemorableDate";
import { User } from "../db/models/User";
import { config } from "../config";
import {
  DateType,
  RepeatPeriod,
  DateVisibility,
} from "../db/models/MemorableDate";

export type MyContext = Context & SessionFlavor<SessionData>;

export function registerDateHandlers(bot: Bot<MyContext>): void {
  // ── /start ──
  bot.command("start", async (ctx) => {
    const user = await getOrCreateUser(ctx);
    if (!user) return;

    const roleLabel =
      user.role === "admin"
        ? "👑 Администратор"
        : user.role === "privileged"
          ? "⭐ Привилегированный"
          : "👤 Обычный пользователь";

    await ctx.reply(
      `👋 Привет, <b>${user.firstName}</b>!\n` +
        `Роль: ${roleLabel}\n\n` +
        `<b>Доступные команды:</b>\n` +
        `/dates — 📋 Список дат\n` +
        `/add — ➕ add дату\n` +
        `/edit — ✏️ Редактировать дату\n` +
        `/delete — 🗑 Удалить дату\n` +
        (user.role === "admin"
          ? `/private — 👑 Управление привилегиями\n`
          : "") +
        `/cancel — ❌ Отменить действие`,
      { parse_mode: "HTML" },
    );
  });

  // ── /отмена ──
  bot.command(["отмена", "cancel"], async (ctx) => {
    ctx.session = initialSession();
    await ctx.reply("❌ Действие отменено.");
  });

  // ── /dates — list dates ──
  bot.command("dates", async (ctx) => {
    const user = await getOrCreateUser(ctx);
    if (!user) return;

    const dates = await getDatesForUser(user.telegramId, user.role);
    if (dates.length === 0) {
      await ctx.reply("📭 Нет добавленных дат.");
      return;
    }

    let text = `📋 <b>Список дат</b> (${dates.length}):\n\n`;
    dates.forEach((d, i) => {
      text += `${i + 1}. ${formatDate(d)}\n`;
    });

    await ctx.reply(text, { parse_mode: "HTML" });
  });

  // ── /add ──
  bot.command("add", async (ctx) => {
    const user = await getOrCreateUser(ctx);
    if (!user) return;

    ctx.session = { step: "add:title", draft: {} };
    await ctx.reply("➕ <b>Добавление даты</b>\n\nВведите название:", {
      parse_mode: "HTML",
    });
  });

  // ── /редактировать ──
  bot.command("edit", async (ctx) => {
    const user = await getOrCreateUser(ctx);
    if (!user) return;

    const dates = await getDatesForUser(user.telegramId, user.role);
    if (dates.length === 0) {
      await ctx.reply("📭 Нет дат для редактирования.");
      return;
    }

    ctx.session = {
      step: "edit:choose",
      draft: { role: user.role, telegramId: user.telegramId },
    };

    const kb = new InlineKeyboard();
    dates.forEach((d) => {
      kb.text(`${d.title}`, `edit_${d._id}`).row();
    });

    await ctx.reply("✏️ Выберите дату для редактирования:", {
      reply_markup: kb,
    });
  });

  // ── /удалить ──
  bot.command("delete", async (ctx) => {
    const user = await getOrCreateUser(ctx);
    if (!user) return;

    const dates = await getDatesForUser(user.telegramId, user.role);
    if (dates.length === 0) {
      await ctx.reply("📭 Нет дат для удаления.");
      return;
    }

    ctx.session = {
      step: "delete:choose",
      draft: { role: user.role, telegramId: user.telegramId },
    };

    const kb = new InlineKeyboard();
    dates.forEach((d) => {
      kb.text(`🗑 ${d.title}`, `delete_${d._id}`).row();
    });

    await ctx.reply("🗑 Выберите дату для удаления:", { reply_markup: kb });
  });

  // ── /private — admin only ──
  bot.command("private", async (ctx) => {
    const user = await getOrCreateUser(ctx);
    if (
      !user ||
      (user.role !== "admin" && user.telegramId !== config.adminId)
    ) {
      await ctx.reply("⛔ Только для администратора.");
      return;
    }

    const kb = new InlineKeyboard()
      .text("➕ add привилегированного", "priv_add")
      .row()
      .text("➖ Удалить привилегированного", "priv_remove")
      .row()
      .text("📋 Список привилегированных", "priv_list");

    await ctx.reply("👑 <b>Управление привилегиями</b>", {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  });

  // ── /testdelay — admin only, sends test notification to group after 1 minute ──
  bot.command("testdelay", async (ctx) => {
    const user = await getOrCreateUser(ctx);
    if (
      !user ||
      (user.role !== "admin" && user.telegramId !== config.adminId)
    ) {
      await ctx.reply("⛔ Только для администратора.");
      return;
    }

    await ctx.reply(
      "⏱ Тестовое уведомление будет отправлено в группу через 1 минуту...",
    );

    setTimeout(async () => {
      try {
        await ctx.api.sendMessage(
          config.groupChatId,
          "🔔 <b>Тестовое уведомление</b>\n\n" +
            "📅 Памятная дата: <b>Тест системы напоминаний</b>\n" +
            "🔁 Повторение: 1️⃣ Один раз\n" +
            "👥 Общедоступная\n\n" +
            "✅ Если вы видите это сообщение — уведомления работают корректно.",
          { parse_mode: "HTML" },
        );
      } catch (err: any) {
        await ctx.reply(
          `❌ Ошибка отправки в группу:\n<code>${err.message}</code>`,
          { parse_mode: "HTML" },
        );
      }
    }, 60 * 1000);
  });

  // ── Callback queries ──
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const user = await getOrCreateUser(ctx);
    if (!user) {
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Edit date select ──
    if (data.startsWith("edit_")) {
      const id = data.replace("edit_", "");
      const doc = await canEditDate(id, user.telegramId, user.role);
      if (!doc) {
        await ctx.answerCallbackQuery({
          text: "❌ Нет доступа",
          show_alert: true,
        });
        return;
      }

      ctx.session = {
        step: "edit:field",
        draft: { id, role: user.role, telegramId: user.telegramId },
      };

      const kb = new InlineKeyboard()
        .text("📌 Название", "efield_title")
        .row()
        .text("📝 Описание", "efield_description")
        .row()
        .text("📅 Дата", "efield_date")
        .row()
        .text("🔔 Тип", "efield_type")
        .row()
        .text("🔁 Повторение", "efield_repeat")
        .row();

      if (user.role === "privileged" || user.role === "admin") {
        kb.text("🔒 Видимость", "efield_visibility").row();
      }

      await ctx.editMessageText(`✏️ <b>${doc.title}</b>\nЧто редактируем?`, {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Edit field select ──
    if (data.startsWith("efield_")) {
      const field = data.replace("efield_", "");
      ctx.session.draft.field = field;
      ctx.session.step = "edit:value";

      if (field === "type") {
        const kb = new InlineKeyboard();
        Object.entries(DATE_TYPE_LABELS).forEach(([k, v]) => {
          kb.text(v, `etypeval_${k}`).row();
        });
        await ctx.editMessageText("🔔 Выберите тип:", { reply_markup: kb });
      } else if (field === "repeat") {
        const kb = new InlineKeyboard();
        Object.entries(REPEAT_LABELS).forEach(([k, v]) => {
          kb.text(v, `erepeatval_${k}`).row();
        });
        await ctx.editMessageText("🔁 Выберите повторение:", {
          reply_markup: kb,
        });
      } else if (field === "visibility") {
        const kb = new InlineKeyboard();
        Object.entries(VISIBILITY_LABELS).forEach(([k, v]) => {
          kb.text(v, `evisval_${k}`).row();
        });
        await ctx.editMessageText("🔒 Выберите видимость:", {
          reply_markup: kb,
        });
      } else {
        const hints: Record<string, string> = {
          title: "Введите новое название:",
          description: 'Введите новое описание (или "нет" для удаления):',
          date: "Введите новую дату в формате ДД.ММ.ГГГГ:",
        };
        await ctx.editMessageText(hints[field] || "Введите новое значение:");
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Edit type/repeat/visibility value via callback ──
    for (const [prefix, field] of [
      ["etypeval_", "dateType"],
      ["erepeatval_", "repeatPeriod"],
      ["evisval_", "visibility"],
    ] as const) {
      if (data.startsWith(prefix)) {
        const value = data.replace(prefix, "");
        const id = ctx.session.draft.id as string;
        await MemorableDate.findByIdAndUpdate(id, { [field]: value });
        ctx.session = initialSession();
        await ctx.editMessageText("✅ Дата обновлена!");
        await ctx.answerCallbackQuery();
        return;
      }
    }

    // ── Delete date ──
    if (data.startsWith("delete_")) {
      const id = data.replace("delete_", "");
      const doc = await canEditDate(id, user.telegramId, user.role);
      if (!doc) {
        await ctx.answerCallbackQuery({
          text: "❌ Нет доступа",
          show_alert: true,
        });
        return;
      }

      const kb = new InlineKeyboard()
        .text("✅ Да, удалить", `confirm_delete_${id}`)
        .text("❌ Отмена", "cancel_delete");

      await ctx.editMessageText(`🗑 Удалить «<b>${doc.title}</b>»?`, {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith("confirm_delete_")) {
      const id = data.replace("confirm_delete_", "");
      await MemorableDate.findByIdAndDelete(id);
      ctx.session = initialSession();
      await ctx.editMessageText("✅ Дата удалена.");
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === "cancel_delete") {
      ctx.session = initialSession();
      await ctx.editMessageText("❌ Удаление отменено.");
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Add date: type/repeat/visibility via callback ──
    if (data.startsWith("addtype_")) {
      ctx.session.draft.dateType = data.replace("addtype_", "");
      ctx.session.step = "add:repeat";
      const kb = new InlineKeyboard();
      Object.entries(REPEAT_LABELS).forEach(([k, v]) =>
        kb.text(v, `addrepeat_${k}`).row(),
      );
      await ctx.editMessageText("🔁 Выберите период повторения:", {
        reply_markup: kb,
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith("addrepeat_")) {
      ctx.session.draft.repeatPeriod = data.replace("addrepeat_", "");
      const role = ctx.session.draft.role as string;

      if (role === "privileged" || role === "admin") {
        ctx.session.step = "add:visibility";
        const kb = new InlineKeyboard();
        Object.entries(VISIBILITY_LABELS).forEach(([k, v]) =>
          kb.text(v, `addvis_${k}`).row(),
        );
        await ctx.editMessageText("🔒 Выберите видимость:", {
          reply_markup: kb,
        });
      } else {
        // Regular users: always public
        await saveNewDate(ctx, "public");
      }
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith("addvis_")) {
      const visibility = data.replace("addvis_", "") as DateVisibility;
      await saveNewDate(ctx, visibility);
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Admin: privileged management ──
    if (data === "priv_add") {
      ctx.session = { step: "admin:add_privileged", draft: {} };
      await ctx.editMessageText(
        "👤 Введите Telegram ID пользователя для добавления привилегий:",
      );
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === "priv_remove") {
      const privUsers = await User.find({ role: "privileged" });
      if (privUsers.length === 0) {
        await ctx.editMessageText("📭 Нет привилегированных пользователей.");
        await ctx.answerCallbackQuery();
        return;
      }
      ctx.session = { step: "admin:remove_privileged", draft: {} };
      const kb = new InlineKeyboard();
      privUsers.forEach((u) => {
        kb.text(
          `${u.firstName} (${u.telegramId})`,
          `priv_rem_${u.telegramId}`,
        ).row();
      });
      await ctx.editMessageText(
        "➖ Выберите пользователя для снятия привилегий:",
        { reply_markup: kb },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === "priv_list") {
      const privUsers = await User.find({
        role: { $in: ["privileged", "admin"] },
      });
      if (privUsers.length === 0) {
        await ctx.answerCallbackQuery({
          text: "Нет привилегированных пользователей",
          show_alert: true,
        });
        return;
      }
      let text = "📋 Привилегированные пользователи:\n\n";
      privUsers.forEach((u) => {
        text += `• ${u.firstName}${u.username ? ` (@${u.username})` : ""} — ID: ${u.telegramId} [${u.role}]\n`;
      });
      await ctx.answerCallbackQuery({ text, show_alert: true });
      return;
    }

    if (data.startsWith("priv_rem_")) {
      const targetId = Number(data.replace("priv_rem_", ""));
      await User.findOneAndUpdate(
        { telegramId: targetId },
        { role: "regular" },
      );
      ctx.session = initialSession();
      await ctx.editMessageText("✅ Привилегии сняты.");
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // ── FSM message handler ──
  bot.on("message:text", async (ctx) => {
    const step = ctx.session.step;
    const draft = ctx.session.draft;
    const text = ctx.message.text.trim();
    const user = await getOrCreateUser(ctx);
    if (!user) return;

    // Ignore commands
    if (text.startsWith("/")) return;

    // ── ADD FLOW ──
    if (step === "add:title") {
      draft.title = text;
      draft.role = user.role;
      draft.telegramId = user.telegramId;
      ctx.session.step = "add:description";
      await ctx.reply("📝 Введите описание (или напишите <code>нет</code>):", {
        parse_mode: "HTML",
      });
      return;
    }

    if (step === "add:description") {
      draft.description = text.toLowerCase() === "нет" ? undefined : text;
      ctx.session.step = "add:date";
      await ctx.reply("📅 Введите дату в формате <code>ДД.ММ.ГГГГ</code>:", {
        parse_mode: "HTML",
      });
      return;
    }

    if (step === "add:date") {
      const date = parseDate(text);
      if (!date) {
        await ctx.reply(
          "❗ Неверный формат. Используйте <code>ДД.ММ.ГГГГ</code>:",
          { parse_mode: "HTML" },
        );
        return;
      }
      draft.date = date;
      ctx.session.step = "add:type";

      const kb = new InlineKeyboard();
      Object.entries(DATE_TYPE_LABELS).forEach(([k, v]) =>
        kb.text(v, `addtype_${k}`).row(),
      );
      await ctx.reply("🔔 Выберите тип даты:", { reply_markup: kb });
      return;
    }

    // ── EDIT FLOW ──
    if (step === "edit:value") {
      const field = draft.field as string;
      const id = draft.id as string;

      if (field === "date") {
        const date = parseDate(text);
        if (!date) {
          await ctx.reply(
            "❗ Неверный формат. Используйте <code>ДД.ММ.ГГГГ</code>:",
            { parse_mode: "HTML" },
          );
          return;
        }
        await MemorableDate.findByIdAndUpdate(id, { date });
      } else if (field === "description") {
        const val = text.toLowerCase() === "нет" ? undefined : text;
        await MemorableDate.findByIdAndUpdate(id, { description: val });
      } else {
        await MemorableDate.findByIdAndUpdate(id, { [field]: text });
      }

      ctx.session = initialSession();
      await ctx.reply("✅ Дата обновлена!");
      return;
    }

    // ── ADMIN: add privileged ──
    if (step === "admin:add_privileged") {
      const targetId = Number(text);
      if (isNaN(targetId)) {
        await ctx.reply("❗ Введите корректный числовой Telegram ID.");
        return;
      }

      const targetUser = await User.findOne({ telegramId: targetId });
      if (!targetUser) {
        await ctx.reply(
          "❌ Пользователь не найден. Он должен сначала написать боту /start.",
        );
        return;
      }

      targetUser.role = "privileged";
      await targetUser.save();
      ctx.session = initialSession();
      await ctx.reply(
        `✅ Пользователь <b>${targetUser.firstName}</b> получил привилегии.`,
        { parse_mode: "HTML" },
      );
      return;
    }
  });
}

async function saveNewDate(
  ctx: MyContext,
  visibility: DateVisibility,
): Promise<void> {
  const draft = ctx.session.draft;
  await createDate({
    title: draft.title as string,
    description: draft.description as string | undefined,
    date: draft.date as Date,
    dateType: (draft.dateType as DateType) || "memorable",
    repeatPeriod: draft.repeatPeriod as RepeatPeriod,
    visibility,
    createdBy: draft.telegramId as number,
  });

  ctx.session = initialSession();

  try {
    await ctx.editMessageText("✅ Дата добавлена!");
  } catch {
    await ctx.reply("✅ Дата добавлена!");
  }
}
