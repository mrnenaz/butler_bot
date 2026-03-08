import { Bot, session } from 'grammy';
import { MyContext, registerDateHandlers } from './handlers/dates';
import { SessionData, initialSession } from './types/session';
import { startNotificationScheduler } from './services/notificationService';
import { config } from './config';

export function createBot(): Bot<MyContext> {
  const bot = new Bot<MyContext>(config.botToken);

  bot.use(session({ initial: initialSession }));

  registerDateHandlers(bot);

  bot.catch((err) => {
    console.error(`❌ Error for update ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}

export function startScheduler(bot: Bot<MyContext>): void {
  startNotificationScheduler(bot as any);
}
