import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { assert } from '../utils/errors.js';
import { jsonValue, publicUserSelect } from '../utils/serialize.js';
import { postDto, postInclude, restaurantDto, restaurantInclude } from '../services/catalog.js';
import { createSession } from '../services/auth.js';
import { disconnectUser } from '../services/realtime.js';
import { phoneSchema } from '../utils/validators.js';
import { paginationSchema, pageMetadata } from '../utils/pagination.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);
profileRouter.get('/', async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.user!.id }, select: { ...publicUserSelect, _count: { select: { likes: true, follows: true, orders: true } } } });
  assert(user, 404, 'NOT_FOUND', 'Пользователь не найден');
  const { _count, ...rest } = user;
  res.json({ data: { ...rest, name: user.username, nickname: user.username, counts: _count } });
});
profileRouter.patch('/', rateLimit('profile', 30, 3600), async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).transform(s => s.toLowerCase()).optional(), bio: z.string().trim().max(300).optional(),
    nickname: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).transform(s => s.toLowerCase()).optional(),
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).transform(s => s.toLowerCase()).optional(),
    email: z.string().trim().pipe(z.email().max(254)).transform(s => s.toLowerCase()).optional(),
    phone: phoneSchema.nullable().optional(),
    currentPassword: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72).optional(), newPassword: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72).optional(),
    language: z.enum(['ru', 'uz', 'en']).optional(), theme: z.enum(['light', 'dark']).optional(),
  }).strict().refine(input => !input.nickname || !input.username || input.nickname === input.username, { message: 'Никнейм должен быть указан однозначно' }).parse(req.body);
  const user = await db.user.findUnique({ where: { id: req.user!.id } });
  assert(user, 404, 'NOT_FOUND', 'Пользователь не найден');
  const handle = input.nickname ?? input.username ?? input.name;
  const passwordVerified = Boolean(input.currentPassword && await bcrypt.compare(input.currentPassword, user.passwordHash));
  if ((input.email && input.email !== user.email) || input.newPassword) assert(passwordVerified, 403, 'PASSWORD_REQUIRED', 'Введите текущий пароль');
  const passwordHash = input.newPassword ? await bcrypt.hash(input.newPassword, 12) : undefined;
  const updated = await db.$transaction(async tx => {
    const current = await tx.user.findUnique({ where: { id: user.id } });
    assert(current && current.tokenVersion === req.user!.tokenVersion, 401, 'UNAUTHORIZED', 'Сессия изменилась. Войдите снова');
    if (handle && handle !== current.username) assert(!current.usernameChangedAt || Date.now() - current.usernameChangedAt.getTime() >= 30 * 86400_000, 409, 'USERNAME_COOLDOWN', 'Никнейм можно менять раз в 30 дней');
    if ((input.email && input.email !== current.email) || input.newPassword) assert(passwordVerified && current.passwordHash === user.passwordHash, 403, 'PASSWORD_REQUIRED', 'Введите текущий пароль');
    if (passwordHash) await tx.session.deleteMany({ where: { userId: user.id } });
    return tx.user.update({ where: { id: user.id }, data: {
      name: handle, bio: input.bio, phone: input.phone, email: input.email,
      ...(handle && handle !== current.username ? { username: handle, usernameChangedAt: new Date() } : {}),
      ...(passwordHash ? { passwordHash, tokenVersion: { increment: 1 } } : {}),
      settings: { upsert: { create: { language: input.language ?? 'ru', theme: input.theme ?? 'light' }, update: { language: input.language, theme: input.theme } } },
    }, select: { ...publicUserSelect, tokenVersion: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (passwordHash) { disconnectUser(user.id); await createSession(res, updated); }
  const { tokenVersion: _version, ...safe } = updated;
  res.json({ data: { ...safe, nickname: updated.username } });
});
profileRouter.get('/likes', async (req, res) => {
  const { page, pageSize } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [likes, total] = await Promise.all([
    db.like.findMany({ where, include: { post: { include: postInclude(req.user!.id) } }, orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db.like.count({ where }),
  ]);
  res.json({ data: jsonValue(likes.map(item => postDto(item.post))), pagination: pageMetadata(page, pageSize, total) });
});
profileRouter.get('/follows', async (req, res) => {
  const { page, pageSize } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [follows, total] = await Promise.all([
    db.follow.findMany({ where, include: { restaurant: { include: restaurantInclude(req.user!.id) } }, orderBy: [{ createdAt: 'desc' }, { restaurantId: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db.follow.count({ where }),
  ]);
  res.json({ data: jsonValue(follows.map(item => restaurantDto(item.restaurant))), pagination: pageMetadata(page, pageSize, total) });
});

