import { connectDB } from './db/connection';
import { createBot, startScheduler } from './bot';

async function main(): Promise<void> {
  console.log('🚀 Starting Dates Reminder Bot...');

  await connectDB();

  const bot = createBot();
  startScheduler(bot);

  process.once('SIGINT', () => bot.stop());
  process.once('SIGTERM', () => bot.stop());

  await bot.start({
    onStart: (info) => {
      console.log(`✅ Bot @${info.username} is running`);
    },
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
