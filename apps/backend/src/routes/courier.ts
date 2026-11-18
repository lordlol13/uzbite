import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { COURIER_AVAILABILITY_STATUSES } from '@uzbite/shared';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { requireCourier } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { createTokenSession, refreshTokenSession, revokeTokenSession } from '../services/auth.js';
import { disconnectSession, ioEvent } from '../services/realtime.js';
import {
  courierAcceptOffer,
  courierRejectOffer,
  courierUpdateDeliveryStatus,
  deliveryInclude,
  expireStaleOffersAndRequests,
  serializeDelivery,
} from '../services/restaurant-delivery.js';
import { assert } from '../utils/errors.js';
import { jsonValue } from '../utils/serialize.js';
import { phoneSchema } from '../utils/validators.js';

export const courierRouter = Router();

const emailSchema = z.string().trim().pipe(z.email().max(254)).transform(s => s.toLowerCase());
const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Пароль должен занимать не больше 72 байт');

courierRouter.post(
  '/auth/register',
  rateLimit('courier-register', env.NODE_ENV === 'production' ? 20 : 100, 3600),
  async (req, res) => {
    const input = z
      .object({
        email: emailSchema,
        password: passwordSchema,
        name: z.string().trim().min(2).max(80),
        phone: phoneSchema.optional(),
      })
      .strict()
      .parse(req.body);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const username = `courier_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const user = await db.user.create({
      data: {
        email: input.email,
        name: input.name,
        username,
        phone: input.phone ?? null,
        passwordHash,
        role: 'COURIER',
        courierAvailability: 'AVAILABLE',
      },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        phone: true,
        role: true,
        tokenVersion: true,
        courierAvailability: true,
      },
    });
    const session = await createTokenSession(user);
    const { tokenVersion: _tv, ...safe } = user;
    res.status(201).json({
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: safe,
      },
    });
  },
);

courierRouter.post('/auth/login', rateLimit('courier-login', 30, 900), async (req, res) => {
  const input = z
    .object({
      email: emailSchema,
      password: z.string().min(1).max(72),
    })
    .strict()
    .parse(req.body);
  const candidate = await db.user.findUnique({ where: { email: input.email } });
  const dummy = '$2b$12$W5HK5wNwf86cby4uX7JS6evD8f54zyvWLVoDjxZdjAh60sFdn7A8S';
  const valid = await bcrypt.compare(input.password, candidate?.passwordHash ?? dummy);
  assert(
    candidate && valid && candidate.role === 'COURIER',
    401,
    'INVALID_CREDENTIALS',
    'Неверная почта или пароль курьера',
  );
  const session = await createTokenSession(candidate);
  res.json({
    data: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: candidate.id,
        email: candidate.email,
        name: candidate.name,
        username: candidate.username,
        phone: candidate.phone,
        role: 'COURIER',
        courierAvailability: candidate.courierAvailability,
      },
    },
  });
});

courierRouter.post('/auth/refresh', rateLimit('courier-refresh', 120, 900), async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).strict().parse(req.body);
  const rotated = await refreshTokenSession(refreshToken, 'COURIER');
  res.json({ data: rotated });
});

courierRouter.post('/auth/logout', async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  const sid = await revokeTokenSession(req.user?.sessionId, req.user?.id, refreshToken);
  if (sid) disconnectSession(sid);
  res.json({ data: { loggedOut: true } });
});

courierRouter.use(requireCourier);

courierRouter.get('/me', async (req, res) => {
  const user = await db.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      phone: true,
      role: true,
      courierAvailability: true,
    },
  });
  res.json({ data: user });
});

courierRouter.patch('/availability', async (req, res) => {
  const { availability } = z
    .object({ availability: z.enum(COURIER_AVAILABILITY_STATUSES) })
    .strict()
    .parse(req.body);
  const updated = await db.$transaction(async tx => {
    const user = await tx.user.update({
      where: { id: req.user!.id },
      data: { courierAvailability: availability },
      select: { id: true, courierAvailability: true },
    });
    await tx.restaurantCourierAffiliation.updateMany({
      where: { courierId: req.user!.id, status: 'ACTIVE' },
      data: { availability },
    });
    return user;
  });
  res.json({ data: updated });
});

courierRouter.get('/affiliations', async (req, res) => {
  const rows = await db.restaurantCourierAffiliation.findMany({
    where: { courierId: req.user!.id },
    include: { restaurant: { select: { id: true, name: true, addressText: true, logoUrl: true } } },
    orderBy: { invitedAt: 'desc' },
  });
  res.json({ data: jsonValue(rows) });
});

courierRouter.post('/affiliations/accept', async (req, res) => {
  const { inviteCode, affiliationId } = z
    .object({
      inviteCode: z.string().trim().min(3).max(40).optional(),
      affiliationId: z.string().trim().min(1).max(100).optional(),
    })
    .strict()
    .parse(req.body);
  assert(inviteCode || affiliationId, 400, 'VALIDATION', 'Укажите код приглашения или ID заявки');

  const affiliation = await db.restaurantCourierAffiliation.findFirst({
    where: {
      courierId: req.user!.id,
      status: 'INVITED',
      ...(inviteCode ? { inviteCode } : { id: affiliationId }),
    },
    include: { restaurant: { select: { id: true, name: true, ownerId: true } } },
  });
  assert(affiliation, 404, 'NOT_FOUND', 'Активное приглашение не найдено');

  const updated = await db.restaurantCourierAffiliation.update({
    where: { id: affiliation.id },
    data: { status: 'ACTIVE', acceptedAt: new Date() },
  });
  if (affiliation.restaurant.ownerId) {
    ioEvent(`restaurant:${affiliation.restaurantId}`, 'notification:created', {
      type: 'COURIER_AFFILIATED',
      title: 'Курьер принял приглашение',
      body: `Курьер присоединился к ${affiliation.restaurant.name}`,
    });
  }
  res.json({ data: jsonValue(updated) });
});

courierRouter.get('/delivery-offers', async (req, res) => {
  await expireStaleOffersAndRequests();
  const offers = await db.deliveryOffer.findMany({
    where: {
      courierId: req.user!.id,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    include: {
      delivery: {
        include: {
          restaurant: { select: { id: true, name: true, addressText: true, latitude: true, longitude: true } },
          order: { select: { id: true, total: true, status: true, items: { select: { dishName: true, quantity: true } } } },
        },
      },
    },
    orderBy: { sentAt: 'desc' },
  });
  res.json({ data: jsonValue(offers) });
});

courierRouter.post('/delivery-offers/:id/accept', async (req, res) => {
  const updated = await courierAcceptOffer({
    courierId: req.user!.id,
    offerId: req.params.id as string,
  });
  res.json({ data: updated });
});

courierRouter.post('/delivery-offers/:id/reject', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).strict().parse(req.body ?? {});
  const updated = await courierRejectOffer({
    courierId: req.user!.id,
    offerId: req.params.id as string,
    reason,
  });
  res.json({ data: updated });
});

courierRouter.get('/deliveries', async (req, res) => {
  const deliveries = await db.delivery.findMany({
    where: { assignedCourierId: req.user!.id },
    include: deliveryInclude,
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  res.json({ data: deliveries.map(serializeDelivery) });
});

courierRouter.patch('/deliveries/:id/status', async (req, res) => {
  const { status, note } = z
    .object({
      status: z.enum(['PICKED_UP', 'ON_THE_WAY', 'DELIVERED']),
      note: z.string().trim().max(300).optional(),
    })
    .strict()
    .parse(req.body);

  const updated = await courierUpdateDeliveryStatus({
    courierId: req.user!.id,
    deliveryId: req.params.id as string,
    status,
    note,
  });
  res.json({ data: updated });
});
