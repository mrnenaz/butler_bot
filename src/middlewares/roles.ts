import { Context, NextFunction } from 'grammy';
import { User, UserRole } from '../db/models/User';
import { config } from '../config';

export async function getOrCreateUser(ctx: Context): Promise<{ telegramId: number; role: UserRole; firstName: string } | null> {
  const from = ctx.from;
  if (!from) return null;

  const telegramId = from.id;
  const isAdmin = telegramId === config.adminId;

  let user = await User.findOne({ telegramId });

  if (!user) {
    user = await User.create({
      telegramId,
      username: from.username,
      firstName: from.first_name,
      role: isAdmin ? 'admin' : 'regular',
    });
  } else {
    // Sync admin status always
    if (isAdmin && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }
  }

  return { telegramId, role: isAdmin ? 'admin' : user.role, firstName: user.firstName };
}

export function requireRole(...roles: UserRole[]) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userInfo = await getOrCreateUser(ctx);
    if (!userInfo) {
      await ctx.reply('❌ Не удалось определить пользователя.');
      return;
    }

    // Admin always has access
    if (userInfo.telegramId === config.adminId) {
      await next();
      return;
    }

    if (!roles.includes(userInfo.role)) {
      await ctx.reply('⛔ Недостаточно прав для этой команды.');
      return;
    }

    await next();
  };
}
