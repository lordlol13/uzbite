import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { Prisma, type DeliveryMode, type OrderStatus } from '@prisma/client';
import { z } from 'zod';
import {
  DELIVERY_MODES,
  POST_STATUSES,
  VIDEO_ASPECT_RATIOS,
  type MenuImportConflictMode,
  type RestaurantAuthResponse,
  type RestaurantStatisticsDto,
} from '@uzbite/shared';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { requireRestaurant } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import {
  createTokenSession,
  refreshTokenSession,
  revokeTokenSession,
} from '../services/auth.js';
import { disconnectSession } from '../services/realtime.js';
import {
  assignOwnCourierToOrder,
  cancelDeliveryAssignment,
  cancelDeliverySearch,
  confirmOrderPayment,
  DEFAULT_BUSINESS_HOURS,
  deliveryInclude,
  expireStaleOffersAndRequests,
  handoverDeliveryToCourier,
  inviteCourierToRestaurant,
  listAffiliatedCouriers,
  markDeliveryReadyForPickup,
  rejectOrderPayment,
  requestOnDemandCourierForOrder,
  restaurantOrderInclude,
  restaurantProfileInclude,
  serializeDelivery,
  serializeRestaurantOrder,
  serializeRestaurantProfile,
  transitionRestaurantOrderStatus,
} from '../services/restaurant-delivery.js';
import {
  buildMenuTemplate,
  confirmMenuImportJob,
  createMenuImportPreview,
  exportImportErrorsSpreadsheet,
  exportMenuSpreadsheet,
  exportOrdersSpreadsheet,
  exportStatisticsSpreadsheet,
} from '../services/excel-csv.js';
import { restaurantReceiptSignedUrl, storeRestaurantMedia } from '../services/media-storage.js';
import { invalidateBusinessCache } from '../services/business-analytics.js';
import { parseDatePeriodFromQuestion } from '../services/date-period-parser.js';
import { ApiError, assert } from '../utils/errors.js';
import { pageMetadata, paginationSchema } from '../utils/pagination.js';
import { jsonValue } from '../utils/serialize.js';
import { phoneSchema } from '../utils/validators.js';
import { restaurantAiRouter } from './restaurant-ai.js';

export const restaurantAccountRouter = Router();

const emailSchema = z.string().trim().pipe(z.email().max(254)).transform(s => s.toLowerCase());
const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Пароль должен занимать не больше 72 байт');

const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1).max(72).optional(),
    restaurantName: z.string().trim().min(2).max(120).optional(),
    language: z.enum(['ru', 'uz', 'en']).default('ru'),
    theme: z.enum(['light', 'dark']).default('light'),
  })
  .strict();

const loginSchema = z.union([
  z.object({ demo: z.literal(true) }).strict(),
  z
    .object({
      email: emailSchema,
      password: z
        .string()
        .min(1)
        .max(72)
        .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Пароль должен занимать не больше 72 байт'),
    })
    .strict(),
]);

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 2 },
});

const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 6 },
});

async function ensureDemoRestaurantOwner() {
  const existing = await db.user.findUnique({ where: { email: 'owner@uzbite.uz' } });
  if (existing && existing.role === 'RESTAURANT') {
    const owned = await db.restaurant.findFirst({ where: { ownerId: existing.id } });
    if (!owned) {
      const osh = await db.restaurant.findUnique({ where: { id: 'rest-osh' } });
      if (osh && !osh.ownerId) {
        await db.restaurant.update({ where: { id: osh.id }, data: { ownerId: existing.id, onboardingCompleted: true } });
      }
    }
    return existing;
  }
  const passwordHash = await bcrypt.hash('UzBiteBusiness2026!', 12);
  const created = await db.user.upsert({
    where: { email: 'owner@uzbite.uz' },
    create: {
      email: 'owner@uzbite.uz',
      username: 'osh_owner',
      name: 'Osh & Olov Restaurant',
      passwordHash,
      role: 'RESTAURANT',
    },
    update: { role: 'RESTAURANT' },
  });
  const osh = await db.restaurant.findUnique({ where: { id: 'rest-osh' } });
  if (osh && !osh.ownerId) {
    await db.restaurant.update({
      where: { id: osh.id },
      data: { ownerId: created.id, onboardingCompleted: true },
    });
  }
  return created;
}

async function resolveOwnedRestaurant(req: Request) {
  const userId = req.user!.id;
  let restaurant = await db.restaurant.findFirst({
    where: { ownerId: userId },
    include: restaurantProfileInclude,
  });
  if (!restaurant && env.NODE_ENV !== 'production') {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email === 'owner@uzbite.uz') {
      restaurant = await db.restaurant.findFirst({
        where: { id: 'rest-osh' },
        include: restaurantProfileInclude,
      });
    }
  }
  assert(restaurant, 404, 'RESTAURANT_NOT_FOUND', 'У аккаунта нет привязанного ресторана');
  return restaurant;
}

restaurantAccountRouter.post(
  '/auth/register',
  rateLimit('restaurant-register', env.NODE_ENV === 'production' ? 10 : 100, 3600),
  async (req, res) => {
    const input = registerSchema.parse(req.body);
    if (input.confirmPassword !== undefined) {
      assert(input.password === input.confirmPassword, 400, 'PASSWORD_MISMATCH', 'Пароли не совпадают');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
    const handle = `rest_${suffix}`;
    const displayName = input.restaurantName?.trim() || `Мой ресторан`;
    const slugBase = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'restaurant';
    const slug = `${slugBase}-${suffix.slice(0, 6)}`;

    const created = await db.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: displayName,
          username: handle,
          passwordHash,
          role: 'RESTAURANT',
          settings: { create: { language: input.language, theme: input.theme } },
        },
        select: { id: true, email: true, name: true, username: true, tokenVersion: true },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          slug,
          name: displayName,
          description: '',
          logoUrl: '/images/uzbite/restaurant-cover.jpg',
          coverUrl: '/images/uzbite/restaurant-cover.jpg',
          galleryUrls: ['/images/uzbite/restaurant-cover.jpg'],
          addressText: 'Ташкент',
          landmark: '',
          latitude: 41.3111,
          longitude: 69.2797,
          isOpen: false,
          acceptingOrders: true,
          onboardingCompleted: false,
          ownerId: user.id,
          categories: {
            create: [{ name: 'Основные блюда', sortOrder: 0 }],
          },
          settings: {
            create: {
              businessHours: DEFAULT_BUSINESS_HOURS as unknown as Prisma.InputJsonValue,
              acceptingOrders: true,
              timezone: 'Asia/Tashkent',
            },
          },
          deliverySettings: {
            create: {
              ownCouriersEnabled: true,
              onDemandCouriersEnabled: true,
              preferredMode: 'OWN_COURIER',
            },
          },
        },
        include: restaurantProfileInclude,
      });

      return { user, restaurant };
    });

    const session = await createTokenSession(created.user);
    const payload: RestaurantAuthResponse = {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: created.user.id,
        email: created.user.email,
        name: created.user.name,
        username: created.user.username,
        role: 'RESTAURANT',
        restaurantId: created.restaurant.id,
        restaurantName: created.restaurant.name,
        onboardingCompleted: created.restaurant.onboardingCompleted,
      },
      restaurant: serializeRestaurantProfile(created.restaurant),
    };
    res.status(201).json({ data: payload });
  },
);

restaurantAccountRouter.post('/auth/login', rateLimit('restaurant-login', 30, 900), async (req, res) => {
  const input = loginSchema.parse(req.body);
  let user;
  if ('demo' in input) {
    assert(
      env.NODE_ENV !== 'production' || process.env.ALLOW_DEVELOPMENT_SEED === 'true',
      403,
      'FORBIDDEN',
      'Демо-вход отключён в production',
    );
    user = await ensureDemoRestaurantOwner();
  } else {
    const candidate = await db.user.findUnique({ where: { email: input.email } });
    const dummy = '$2b$12$W5HK5wNwf86cby4uX7JS6evD8f54zyvWLVoDjxZdjAh60sFdn7A8S';
    const valid = await bcrypt.compare(input.password, candidate?.passwordHash ?? dummy);
    assert(
      candidate && valid && candidate.role === 'RESTAURANT',
      401,
      'INVALID_CREDENTIALS',
      'Неверная почта или пароль ресторанного аккаунта',
    );
    user = candidate;
  }

  let restaurant = await db.restaurant.findFirst({
    where: { ownerId: user.id },
    include: restaurantProfileInclude,
  });
  if (!restaurant && env.NODE_ENV !== 'production' && user.email === 'owner@uzbite.uz') {
    restaurant = await db.restaurant.findFirst({
      where: { id: 'rest-osh' },
      include: restaurantProfileInclude,
    });
  }

  const session = await createTokenSession(user);
  const payload: RestaurantAuthResponse = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      role: 'RESTAURANT',
      restaurantId: restaurant?.id ?? null,
      restaurantName: restaurant?.name ?? null,
      onboardingCompleted: restaurant?.onboardingCompleted ?? false,
    },
    restaurant: restaurant ? serializeRestaurantProfile(restaurant) : null,
  };
  res.json({ data: payload });
});

restaurantAccountRouter.post('/auth/refresh', rateLimit('restaurant-refresh', 120, 900), async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).strict().parse(req.body);
  const rotated = await refreshTokenSession(refreshToken, 'RESTAURANT');
  res.json({ data: rotated });
});

restaurantAccountRouter.post('/auth/logout', async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  const sid = await revokeTokenSession(req.user?.sessionId, req.user?.id, refreshToken);
  if (sid) disconnectSession(sid);
  res.json({ data: { loggedOut: true } });
});

restaurantAccountRouter.use(requireRestaurant);
restaurantAccountRouter.use('/ai', restaurantAiRouter);

restaurantAccountRouter.get('/me', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const user = await db.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, username: true },
  });
  res.json({
    data: {
      user: {
        ...user,
        role: 'RESTAURANT' as const,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        onboardingCompleted: restaurant.onboardingCompleted,
      },
      restaurant: serializeRestaurantProfile(restaurant),
    },
  });
});

const businessHourItemSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    label: z.string().trim().min(1).max(20),
    isOpen: z.boolean(),
    openTime: z.string().regex(/^\d{2}:\d{2}$/),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/),
    overnight: z.boolean().default(false),
  })
  .strict();

const onboardingSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).default(''),
    phone: phoneSchema.nullable().optional(),
    logoUrl: z.string().trim().min(1).max(500).optional(),
    coverUrl: z.string().trim().min(1).max(500).optional(),
    addressText: z.string().trim().min(3).max(300),
    landmark: z.string().trim().max(200).default(''),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    businessHours: z.array(businessHourItemSchema).length(7),
    timezone: z.string().trim().min(2).max(60).default('Asia/Tashkent'),
    acceptCash: z.boolean().default(true),
    acceptCard: z.boolean().default(false),
    paymentRecipient: z.string().trim().max(120).nullable().optional(),
    paymentDetails: z.string().trim().max(500).nullable().optional(),
    paymentQrUrl: z.string().trim().max(500).nullable().optional(),
    paymentInstructions: z.string().trim().max(500).nullable().optional(),
    ownCouriersEnabled: z.boolean().default(true),
    onDemandCouriersEnabled: z.boolean().default(true),
    preferredMode: z.enum(DELIVERY_MODES).default('OWN_COURIER'),
    deliveryFee: z.coerce.number().min(0).max(500_000).optional(),
    courierRewardFee: z.coerce.number().min(0).max(500_000).optional(),
  })
  .strict();

restaurantAccountRouter.put('/onboarding', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = onboardingSchema.parse(req.body);
  assert(
    input.ownCouriersEnabled || input.onDemandCouriersEnabled,
    400,
    'DELIVERY_MODE_REQUIRED',
    'Выберите хотя бы один способ доставки',
  );
  assert(
    input.acceptCash || input.acceptCard,
    400,
    'PAYMENT_METHOD_REQUIRED',
    'Включите хотя бы один способ оплаты',
  );
  if (input.acceptCard) {
    assert(
      Boolean(input.paymentDetails?.trim()),
      400,
      'PAYMENT_DETAILS_REQUIRED',
      'Укажите платёжные реквизиты для перевода на карту',
    );
  }

  const updated = await db.$transaction(async tx => {
    await tx.restaurantSettings.upsert({
      where: { restaurantId: restaurant.id },
      create: {
        restaurantId: restaurant.id,
        businessHours: input.businessHours as unknown as Prisma.InputJsonValue,
        acceptingOrders: true,
        timezone: input.timezone,
      },
      update: {
        businessHours: input.businessHours as unknown as Prisma.InputJsonValue,
        timezone: input.timezone,
      },
    });
    await tx.restaurantDeliverySettings.upsert({
      where: { restaurantId: restaurant.id },
      create: {
        restaurantId: restaurant.id,
        ownCouriersEnabled: input.ownCouriersEnabled,
        onDemandCouriersEnabled: input.onDemandCouriersEnabled,
        preferredMode: input.preferredMode as DeliveryMode,
        baseDeliveryFee: input.deliveryFee ?? restaurant.deliveryFee.toNumber(),
        courierRewardFee: input.courierRewardFee ?? 10000,
      },
      update: {
        ownCouriersEnabled: input.ownCouriersEnabled,
        onDemandCouriersEnabled: input.onDemandCouriersEnabled,
        preferredMode: input.preferredMode as DeliveryMode,
        ...(input.deliveryFee !== undefined ? { baseDeliveryFee: input.deliveryFee } : {}),
        ...(input.courierRewardFee !== undefined ? { courierRewardFee: input.courierRewardFee } : {}),
      },
    });
    return tx.restaurant.update({
      where: { id: restaurant.id },
      data: {
        name: input.name,
        description: input.description,
        phone: input.phone ?? restaurant.phone,
        logoUrl: input.logoUrl ?? restaurant.logoUrl,
        coverUrl: input.coverUrl ?? restaurant.coverUrl,
        addressText: input.addressText,
        landmark: input.landmark,
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: input.timezone,
        acceptCash: input.acceptCash,
        acceptCard: input.acceptCard,
        paymentRecipient: input.paymentRecipient ?? null,
        paymentDetails: input.paymentDetails ?? null,
        paymentQrUrl: input.paymentQrUrl ?? null,
        paymentInstructions: input.paymentInstructions ?? null,
        ...(input.deliveryFee !== undefined ? { deliveryFee: input.deliveryFee } : {}),
        isOpen: true,
        acceptingOrders: true,
        onboardingCompleted: true,
      },
      include: restaurantProfileInclude,
    });
  });

  res.json({ data: serializeRestaurantProfile(updated) });
});

restaurantAccountRouter.get('/dashboard', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  await expireStaleOffersAndRequests(restaurant.id);

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [orders, postsCount, recentOrders] = await Promise.all([
    db.order.findMany({
      where: { restaurantId: restaurant.id },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        payment: { select: { method: true, status: true } },
      },
    }),
    db.post.count({ where: { restaurantId: restaurant.id } }),
    db.order.findMany({
      where: { restaurantId: restaurant.id },
      include: restaurantOrderInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 12,
    }),
  ]);

  const profile = serializeRestaurantProfile(restaurant);
  let ordersToday = 0;
  let newOrders = 0;
  let activeOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let ordersRevenue = 0;
  let confirmedPaymentsAmount = 0;
  let cashConfirmedAmount = 0;

  for (const o of orders) {
    const amt = o.total.toNumber();
    if (o.createdAt >= startOfDay) ordersToday++;
    if (o.status === 'PENDING_ACCEPTANCE') newOrders++;
    if (['PENDING_ACCEPTANCE', 'ACCEPTED', 'PREPARING', 'DELIVERING'].includes(o.status)) activeOrders++;
    if (o.status === 'DELIVERED') completedOrders++;
    if (o.status === 'CANCELLED') cancelledOrders++;
    if (o.status !== 'CANCELLED') ordersRevenue += amt;
    if (o.payment?.status === 'PAID') {
      confirmedPaymentsAmount += amt;
      if (o.payment.method === 'CASH') cashConfirmedAmount += amt;
    }
  }

  res.json({
    data: {
      restaurant: profile,
      stats: {
        ordersToday,
        newOrders,
        activeOrders,
        completedOrders,
        cancelledOrders,
        followers: profile.followerCount,
        averageRating: profile.rating,
        reviewCount: profile.reviewCount,
        publicationsCount: postsCount,
        ordersRevenue,
        confirmedPaymentsAmount,
        cashConfirmedAmount,
      },
      recentOrders: recentOrders.map(serializeRestaurantOrder),
    },
  });
});

restaurantAccountRouter.get('/profile', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  res.json({ data: serializeRestaurantProfile(restaurant) });
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    phone: phoneSchema.nullable().optional(),
    telegram: z.string().trim().max(100).nullable().optional(),
    logoUrl: z.string().trim().min(1).max(500).optional(),
    coverUrl: z.string().trim().min(1).max(500).optional(),
    galleryUrls: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
    isOpen: z.boolean().optional(),
    preparationMinutes: z.coerce.number().int().min(5).max(180).optional(),
    deliveryFee: z.coerce.number().min(0).max(500_000).optional(),
    minOrder: z.coerce.number().min(0).max(1_000_000).optional(),
  })
  .strict();

restaurantAccountRouter.patch('/profile', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = updateProfileSchema.parse(req.body);
  const updated = await db.restaurant.update({
    where: { id: restaurant.id },
    data: input,
    include: restaurantProfileInclude,
  });
  res.json({ data: serializeRestaurantProfile(updated) });
});

restaurantAccountRouter.get('/settings', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  res.json({ data: serializeRestaurantProfile(restaurant) });
});

const updateSettingsSchema = z
  .object({
    acceptingOrders: z.boolean().optional(),
    isOpen: z.boolean().optional(),
    timezone: z.string().trim().min(2).max(60).optional(),
    notificationsEnabled: z.boolean().optional(),
    acceptCash: z.boolean().optional(),
    acceptCard: z.boolean().optional(),
    paymentRecipient: z.string().trim().max(120).nullable().optional(),
    paymentDetails: z.string().trim().max(500).nullable().optional(),
    paymentQrUrl: z.string().trim().max(500).nullable().optional(),
    paymentInstructions: z.string().trim().max(500).nullable().optional(),
    deliverySettings: z
      .object({
        ownCouriersEnabled: z.boolean().optional(),
        onDemandCouriersEnabled: z.boolean().optional(),
        preferredMode: z.enum(DELIVERY_MODES).optional(),
        baseDeliveryFee: z.coerce.number().min(0).max(500_000).optional(),
        courierRewardFee: z.coerce.number().min(0).max(500_000).optional(),
        offerTimeoutSeconds: z.coerce.number().int().min(30).max(900).optional(),
        searchTimeoutSeconds: z.coerce.number().int().min(60).max(1800).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

restaurantAccountRouter.put('/settings', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = updateSettingsSchema.parse(req.body);

  const nextAcceptCash = input.acceptCash ?? restaurant.acceptCash;
  const nextAcceptCard = input.acceptCard ?? restaurant.acceptCard;
  assert(nextAcceptCash || nextAcceptCard, 400, 'PAYMENT_METHOD_REQUIRED', 'Должен быть включён хотя бы один способ оплаты');
  const nextPaymentDetails = input.paymentDetails !== undefined ? input.paymentDetails : restaurant.paymentDetails;
  if (nextAcceptCard) {
    assert(Boolean(nextPaymentDetails?.trim()), 400, 'PAYMENT_DETAILS_REQUIRED', 'Для приёма переводов на карту укажите реквизиты');
  }

  const ds = input.deliverySettings;
  if (ds) {
    const nextOwn = ds.ownCouriersEnabled ?? restaurant.deliverySettings?.ownCouriersEnabled ?? true;
    const nextOnDemand = ds.onDemandCouriersEnabled ?? restaurant.deliverySettings?.onDemandCouriersEnabled ?? true;
    const nextPreferred = ds.preferredMode ?? restaurant.deliverySettings?.preferredMode ?? 'OWN_COURIER';
    if (nextPreferred === 'OWN_COURIER' && !nextOwn && nextOnDemand) {
      ds.preferredMode = 'ON_DEMAND_COURIER';
    } else if (nextPreferred === 'ON_DEMAND_COURIER' && !nextOnDemand && nextOwn) {
      ds.preferredMode = 'OWN_COURIER';
    }
  }

  const updated = await db.$transaction(async tx => {
    if (
      input.acceptingOrders !== undefined ||
      input.timezone !== undefined ||
      input.notificationsEnabled !== undefined
    ) {
      await tx.restaurantSettings.upsert({
        where: { restaurantId: restaurant.id },
        create: {
          restaurantId: restaurant.id,
          businessHours: DEFAULT_BUSINESS_HOURS as unknown as Prisma.InputJsonValue,
          acceptingOrders: input.acceptingOrders ?? restaurant.acceptingOrders,
          timezone: input.timezone ?? restaurant.timezone,
          notificationsEnabled: input.notificationsEnabled ?? true,
        },
        update: {
          ...(input.acceptingOrders !== undefined ? { acceptingOrders: input.acceptingOrders } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.notificationsEnabled !== undefined
            ? { notificationsEnabled: input.notificationsEnabled }
            : {}),
        },
      });
    }

    if (ds) {
      await tx.restaurantDeliverySettings.upsert({
        where: { restaurantId: restaurant.id },
        create: {
          restaurantId: restaurant.id,
          ownCouriersEnabled: ds.ownCouriersEnabled ?? true,
          onDemandCouriersEnabled: ds.onDemandCouriersEnabled ?? true,
          preferredMode: (ds.preferredMode ?? 'OWN_COURIER') as DeliveryMode,
          baseDeliveryFee: ds.baseDeliveryFee ?? restaurant.deliveryFee.toNumber(),
          courierRewardFee: ds.courierRewardFee ?? 10000,
          offerTimeoutSeconds: ds.offerTimeoutSeconds ?? 120,
          searchTimeoutSeconds: ds.searchTimeoutSeconds ?? 300,
        },
        update: {
          ...(ds.ownCouriersEnabled !== undefined ? { ownCouriersEnabled: ds.ownCouriersEnabled } : {}),
          ...(ds.onDemandCouriersEnabled !== undefined
            ? { onDemandCouriersEnabled: ds.onDemandCouriersEnabled }
            : {}),
          ...(ds.preferredMode !== undefined ? { preferredMode: ds.preferredMode as DeliveryMode } : {}),
          ...(ds.baseDeliveryFee !== undefined ? { baseDeliveryFee: ds.baseDeliveryFee } : {}),
          ...(ds.courierRewardFee !== undefined ? { courierRewardFee: ds.courierRewardFee } : {}),
          ...(ds.offerTimeoutSeconds !== undefined ? { offerTimeoutSeconds: ds.offerTimeoutSeconds } : {}),
          ...(ds.searchTimeoutSeconds !== undefined ? { searchTimeoutSeconds: ds.searchTimeoutSeconds } : {}),
        },
      });
    }

    return tx.restaurant.update({
      where: { id: restaurant.id },
      data: {
        ...(input.acceptingOrders !== undefined ? { acceptingOrders: input.acceptingOrders } : {}),
        ...(input.isOpen !== undefined ? { isOpen: input.isOpen } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.acceptCash !== undefined ? { acceptCash: input.acceptCash } : {}),
        ...(input.acceptCard !== undefined ? { acceptCard: input.acceptCard } : {}),
        ...(input.paymentRecipient !== undefined ? { paymentRecipient: input.paymentRecipient } : {}),
        ...(input.paymentDetails !== undefined ? { paymentDetails: input.paymentDetails } : {}),
        ...(input.paymentQrUrl !== undefined ? { paymentQrUrl: input.paymentQrUrl } : {}),
        ...(input.paymentInstructions !== undefined ? { paymentInstructions: input.paymentInstructions } : {}),
        ...(ds?.baseDeliveryFee !== undefined ? { deliveryFee: ds.baseDeliveryFee } : {}),
      },
      include: restaurantProfileInclude,
    });
  });

  res.json({ data: serializeRestaurantProfile(updated) });
});

restaurantAccountRouter.get('/location', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  res.json({
    data: {
      addressText: restaurant.addressText,
      landmark: restaurant.landmark,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
    },
  });
});

restaurantAccountRouter.put('/location', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = z
    .object({
      addressText: z.string().trim().min(3).max(300),
      landmark: z.string().trim().max(200).default(''),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .strict()
    .parse(req.body);
  const updated = await db.restaurant.update({
    where: { id: restaurant.id },
    data: input,
    include: restaurantProfileInclude,
  });
  res.json({ data: serializeRestaurantProfile(updated) });
});

restaurantAccountRouter.get('/business-hours', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const profile = serializeRestaurantProfile(restaurant);
  res.json({ data: profile.settings });
});

restaurantAccountRouter.put('/business-hours', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = z
    .object({
      businessHours: z.array(businessHourItemSchema).length(7),
      acceptingOrders: z.boolean().optional(),
      timezone: z.string().trim().min(2).max(60).optional(),
    })
    .strict()
    .parse(req.body);

  await db.$transaction(async tx => {
    await tx.restaurantSettings.upsert({
      where: { restaurantId: restaurant.id },
      create: {
        restaurantId: restaurant.id,
        businessHours: input.businessHours as unknown as Prisma.InputJsonValue,
        acceptingOrders: input.acceptingOrders ?? restaurant.acceptingOrders,
        timezone: input.timezone ?? restaurant.timezone,
      },
      update: {
        businessHours: input.businessHours as unknown as Prisma.InputJsonValue,
        ...(input.acceptingOrders !== undefined ? { acceptingOrders: input.acceptingOrders } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });
    if (input.acceptingOrders !== undefined || input.timezone !== undefined) {
      await tx.restaurant.update({
        where: { id: restaurant.id },
        data: {
          ...(input.acceptingOrders !== undefined ? { acceptingOrders: input.acceptingOrders } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        },
      });
    }
  });

  const refreshed = await resolveOwnedRestaurant(req);
  res.json({ data: serializeRestaurantProfile(refreshed).settings });
});

const ordersQuerySchema = paginationSchema.extend({
  filter: z
    .enum([
      'ALL',
      'NEW',
      'ACCEPTED',
      'PREPARING',
      'WAITING_COURIER',
      'DELIVERING',
      'DELIVERED',
      'CANCELLED',
    ])
    .default('ALL'),
  q: z.string().trim().max(100).optional(),
});

restaurantAccountRouter.get('/orders', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  await expireStaleOffersAndRequests(restaurant.id);
  const { page, pageSize, filter, q } = ordersQuerySchema.parse(req.query);

  const filterWhere: Prisma.OrderWhereInput =
    filter === 'NEW'
      ? { status: 'PENDING_ACCEPTANCE' }
      : filter === 'ACCEPTED'
        ? { status: 'ACCEPTED' }
        : filter === 'PREPARING'
          ? { status: 'PREPARING' }
          : filter === 'WAITING_COURIER'
            ? {
                status: { in: ['ACCEPTED', 'PREPARING'] },
                OR: [
                  { delivery: null },
                  {
                    delivery: {
                      status: {
                        in: [
                          'NOT_REQUESTED',
                          'SEARCHING',
                          'OFFERED',
                          'ASSIGNED',
                          'COURIER_ACCEPTED',
                          'READY_FOR_PICKUP',
                          'FAILED',
                          'CANCELLED',
                        ],
                      },
                    },
                  },
                ],
              }
            : filter === 'DELIVERING'
              ? { status: 'DELIVERING' }
              : filter === 'DELIVERED'
                ? { status: 'DELIVERED' }
                : filter === 'CANCELLED'
                  ? { status: 'CANCELLED' }
                  : {};

  const where: Prisma.OrderWhereInput = {
    restaurantId: restaurant.id,
    ...filterWhere,
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { recipientName: { contains: q, mode: 'insensitive' } },
            { recipientPhone: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      include: restaurantOrderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.order.count({ where }),
  ]);

  res.json({
    data: orders.map(serializeRestaurantOrder),
    pagination: pageMetadata(page, pageSize, total),
  });
});

restaurantAccountRouter.get('/orders/:id', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  await expireStaleOffersAndRequests(restaurant.id);
  const order = await db.order.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
    include: restaurantOrderInclude,
  });
  assert(order, 404, 'NOT_FOUND', 'Заказ не найден');
  res.json({ data: serializeRestaurantOrder(order) });
});

restaurantAccountRouter.post('/orders/:id/accept', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const updated = await transitionRestaurantOrderStatus({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.id as string,
    nextStatus: 'ACCEPTED',
    note: 'Заказ принят рестораном',
  });
  res.json({ data: updated });
});

restaurantAccountRouter.patch('/orders/:id/status', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { status, note } = z
    .object({
      status: z.enum(['ACCEPTED', 'PREPARING', 'DELIVERING', 'DELIVERED', 'CANCELLED']),
      note: z.string().trim().max(300).optional(),
    })
    .strict()
    .parse(req.body);
  const updated = await transitionRestaurantOrderStatus({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.id as string,
    nextStatus: status as OrderStatus,
    note,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.post('/orders/:id/cancel', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { reason } = z.object({ reason: z.string().trim().min(2).max(300) }).strict().parse(req.body);
  const updated = await transitionRestaurantOrderStatus({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.id as string,
    nextStatus: 'CANCELLED',
    note: reason,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.get('/payments', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const payments = await db.payment.findMany({
    where: {
      order: { restaurantId: restaurant.id },
      ...(status && status !== 'ALL' ? { status: status as never } : {}),
    },
    include: {
      order: {
        select: {
          id: true,
          recipientName: true,
          total: true,
          status: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ data: jsonValue(payments) });
});

restaurantAccountRouter.get('/payments/:id/receipt', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const url = await restaurantReceiptSignedUrl(restaurant.id, req.params.id as string);
  res.json({ data: { url } });
});

restaurantAccountRouter.post('/payments/:id/confirm', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const updated = await confirmOrderPayment({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    paymentId: req.params.id as string,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.post('/payments/:id/reject', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).strict().parse(req.body);
  const updated = await rejectOrderPayment({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    paymentId: req.params.id as string,
    reason,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.get('/categories', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const categories = await db.restaurantCategory.findMany({
    where: { restaurantId: restaurant.id },
    include: { _count: { select: { dishes: { where: { isArchived: false } } } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({
    data: categories.map(c => ({
      id: c.id,
      restaurantId: c.restaurantId,
      name: c.name,
      sortOrder: c.sortOrder,
      dishCount: c._count.dishes,
    })),
  });
});

restaurantAccountRouter.post('/categories', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).strict().parse(req.body);
  assert(name.toLowerCase() !== 'все', 400, 'RESERVED_CATEGORY', 'Категория «Все» является системной');
  const maxOrder = await db.restaurantCategory.aggregate({
    where: { restaurantId: restaurant.id },
    _max: { sortOrder: true },
  });
  const created = await db.restaurantCategory.create({
    data: {
      restaurantId: restaurant.id,
      name,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
  res.status(201).json({ data: { ...created, dishCount: 0 } });
});

restaurantAccountRouter.patch('/categories/:id', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const existing = await db.restaurantCategory.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
  });
  assert(existing, 404, 'NOT_FOUND', 'Категория не найдена');
  const input = z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      sortOrder: z.number().int().min(0).max(1000).optional(),
    })
    .strict()
    .parse(req.body);
  if (input.name) {
    assert(input.name.toLowerCase() !== 'все', 400, 'RESERVED_CATEGORY', 'Категория «Все» является системной');
  }
  const updated = await db.restaurantCategory.update({
    where: { id: existing.id },
    data: input,
    include: { _count: { select: { dishes: { where: { isArchived: false } } } } },
  });
  res.json({
    data: {
      id: updated.id,
      restaurantId: updated.restaurantId,
      name: updated.name,
      sortOrder: updated.sortOrder,
      dishCount: updated._count.dishes,
    },
  });
});

restaurantAccountRouter.post('/categories/reorder', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { categoryIds } = z.object({ categoryIds: z.array(z.string().min(1)).min(1).max(200) }).strict().parse(req.body);
  const owned = await db.restaurantCategory.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map(c => c.id));
  assert(categoryIds.every(id => ownedSet.has(id)), 400, 'INVALID_CATEGORY', 'Указаны чужие категории');

  await db.$transaction(
    categoryIds.map((id, index) =>
      db.restaurantCategory.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  res.json({ data: { reordered: true } });
});

restaurantAccountRouter.delete('/categories/:id', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const category = await db.restaurantCategory.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
    include: { _count: { select: { dishes: true } } },
  });
  assert(category, 404, 'NOT_FOUND', 'Категория не найдена');
  assert(
    category._count.dishes === 0,
    409,
    'CATEGORY_NOT_EMPTY',
    'Сначала перенесите блюда из этой категории в другую',
  );
  await db.restaurantCategory.delete({ where: { id: category.id } });
  res.json({ data: { deleted: true, id: category.id } });
});

restaurantAccountRouter.get('/dishes', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
  const includeArchived = req.query.includeArchived === 'true';
  const dishes = await db.dish.findMany({
    where: {
      restaurantId: restaurant.id,
      ...(includeArchived ? {} : { isArchived: false }),
      ...(categoryId ? { categoryId } : {}),
    },
    include: {
      category: { select: { name: true } },
      _count: { select: { posts: true } },
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
  });
  res.json({
    data: dishes.map(d => ({
      id: d.id,
      restaurantId: d.restaurantId,
      categoryId: d.categoryId,
      categoryName: d.category.name,
      sku: d.sku,
      name: d.name,
      description: d.description,
      price: d.price.toNumber(),
      costPrice: d.costPrice.toNumber(),
      imageUrl: d.imageUrl,
      isAvailable: d.isAvailable,
      isArchived: d.isArchived,
      postCount: d._count.posts,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
});

const dishBodySchema = z
  .object({
    categoryId: z.string().min(1).max(100),
    sku: z.string().trim().max(64).nullable().optional(),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).default(''),
    price: z.coerce.number().min(0).max(1_000_000_000),
    costPrice: z.coerce.number().min(0).max(1_000_000_000).optional(),
    imageUrl: z.string().trim().min(1).max(500).optional(),
    isAvailable: z.boolean().default(true),
  })
  .strict();

restaurantAccountRouter.post('/dishes', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = dishBodySchema.parse(req.body);
  const cat = await db.restaurantCategory.findFirst({
    where: { id: input.categoryId, restaurantId: restaurant.id },
  });
  assert(cat, 400, 'CATEGORY_NOT_FOUND', 'Категория не найдена в этом ресторане');

  const created = await db.dish.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: cat.id,
      sku: input.sku?.trim() || null,
      name: input.name,
      description: input.description,
      price: new Prisma.Decimal(Math.round(input.price * 100) / 100),
      costPrice: new Prisma.Decimal(Math.round((input.costPrice ?? 0) * 100) / 100),
      imageUrl: input.imageUrl ?? restaurant.logoUrl,
      isAvailable: input.isAvailable,
    },
    include: { category: { select: { name: true } }, _count: { select: { posts: true } } },
  });
  invalidateBusinessCache(restaurant.id);
  res.status(201).json({
    data: {
      id: created.id,
      restaurantId: created.restaurantId,
      categoryId: created.categoryId,
      categoryName: created.category.name,
      sku: created.sku,
      name: created.name,
      description: created.description,
      price: created.price.toNumber(),
      costPrice: created.costPrice.toNumber(),
      imageUrl: created.imageUrl,
      isAvailable: created.isAvailable,
      isArchived: created.isArchived,
      postCount: created._count.posts,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  });
});

restaurantAccountRouter.patch('/dishes/:id', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const existing = await db.dish.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
  });
  assert(existing, 404, 'NOT_FOUND', 'Блюдо не найдена или принадлежит другому ресторану');

  const input = dishBodySchema.partial().extend({ isArchived: z.boolean().optional() }).strict().parse(req.body);
  if (input.categoryId) {
    const cat = await db.restaurantCategory.findFirst({
      where: { id: input.categoryId, restaurantId: restaurant.id },
    });
    assert(cat, 400, 'CATEGORY_NOT_FOUND', 'Категория не найдена в этом ресторане');
  }

  const updated = await db.dish.update({
    where: { id: existing.id },
    data: {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.sku !== undefined ? { sku: input.sku?.trim() || null } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.price !== undefined ? { price: new Prisma.Decimal(Math.round(input.price * 100) / 100) } : {}),
      ...(input.costPrice !== undefined
        ? { costPrice: new Prisma.Decimal(Math.round(input.costPrice * 100) / 100) }
        : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
      ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
    },
    include: { category: { select: { name: true } }, _count: { select: { posts: true } } },
  });
  invalidateBusinessCache(restaurant.id);
  res.json({
    data: {
      id: updated.id,
      restaurantId: updated.restaurantId,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
      sku: updated.sku,
      name: updated.name,
      description: updated.description,
      price: updated.price.toNumber(),
      costPrice: updated.costPrice.toNumber(),
      imageUrl: updated.imageUrl,
      isAvailable: updated.isAvailable,
      isArchived: updated.isArchived,
      postCount: updated._count.posts,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

restaurantAccountRouter.delete('/dishes/:id', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const existing = await db.dish.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
    include: { _count: { select: { orderItems: true } } },
  });
  assert(existing, 404, 'NOT_FOUND', 'Блюдо не найдено');
  if (existing._count.orderItems > 0) {
    await db.dish.update({
      where: { id: existing.id },
      data: { isArchived: true, isAvailable: false },
    });
    res.json({ data: { archived: true, id: existing.id } });
    return;
  }
  await db.dish.delete({ where: { id: existing.id } });
  invalidateBusinessCache(restaurant.id);
  res.json({ data: { deleted: true, id: existing.id } });
});

restaurantAccountRouter.get('/posts', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const posts = await db.post.findMany({
    where: { restaurantId: restaurant.id },
    include: {
      dish: true,
      media: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { likes: true, comments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    data: jsonValue(
      posts.map(p => ({
        ...p,
        likeCount: p._count.likes,
        commentCount: p._count.comments,
      })),
    ),
  });
});

const postCreateSchema = z
  .object({
    title: z.string().trim().max(160).default(''),
    caption: z.string().trim().min(1).max(2000),
    categoryName: z.string().trim().max(80).nullable().optional(),
    dishId: z.string().trim().max(100).nullable().optional(),
    status: z.enum(POST_STATUSES).default('PUBLISHED'),
    aspectRatio: z.enum(VIDEO_ASPECT_RATIOS).default('9:16'),
    mediaType: z.enum(['VIDEO', 'IMAGE']).default('VIDEO'),
    mediaUrl: z.string().trim().min(1).max(500),
    posterUrl: z.string().trim().max(500).nullable().optional(),
    duration: z.coerce.number().min(0).max(3600).nullable().optional(),
    width: z.coerce.number().int().min(1).max(10000).nullable().optional(),
    height: z.coerce.number().int().min(1).max(10000).nullable().optional(),
    size: z.coerce.number().int().min(1).nullable().optional(),
  })
  .strict();

restaurantAccountRouter.post('/posts', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const input = postCreateSchema.parse(req.body);
  if (input.dishId) {
    const dish = await db.dish.findFirst({
      where: { id: input.dishId, restaurantId: restaurant.id, isArchived: false },
    });
    assert(dish, 400, 'DISH_NOT_FOUND', 'Связанное блюдо должно принадлежать вашему ресторану');
  }
  const now = new Date();
  const created = await db.post.create({
    data: {
      restaurantId: restaurant.id,
      dishId: input.dishId ?? null,
      title: input.title,
      caption: input.caption,
      categoryName: input.categoryName ?? null,
      status: input.status,
      aspectRatio: input.aspectRatio,
      publishedAt: input.status === 'PUBLISHED' ? now : null,
      media: {
        create: [
          {
            url: input.mediaUrl,
            posterUrl: input.posterUrl ?? restaurant.coverUrl,
            type: input.mediaType,
            duration: input.duration ?? null,
            width: input.width ?? (input.aspectRatio === '9:16' ? 720 : input.aspectRatio === '16:9' ? 1280 : 960),
            height: input.height ?? (input.aspectRatio === '9:16' ? 1280 : input.aspectRatio === '16:9' ? 720 : 720),
            size: input.size ?? null,
            sortOrder: 0,
          },
        ],
      },
    },
    include: {
      dish: true,
      media: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { likes: true, comments: true } },
    },
  });
  res.status(201).json({
    data: jsonValue({
      ...created,
      likeCount: created._count.likes,
      commentCount: created._count.comments,
    }),
  });
});

restaurantAccountRouter.patch('/posts/:id', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const existing = await db.post.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
  });
  assert(existing, 404, 'NOT_FOUND', 'Публикация не найдена');
  const input = postCreateSchema.partial().strict().parse(req.body);
  if (input.dishId) {
    const dish = await db.dish.findFirst({
      where: { id: input.dishId, restaurantId: restaurant.id, isArchived: false },
    });
    assert(dish, 400, 'DISH_NOT_FOUND', 'Связанное блюдо должно принадлежать вашему ресторану');
  }
  const updated = await db.$transaction(async tx => {
    if (input.mediaUrl) {
      const firstMedia = await tx.postMedia.findFirst({
        where: { postId: existing.id },
        orderBy: { sortOrder: 'asc' },
      });
      if (firstMedia) {
        await tx.postMedia.update({
          where: { id: firstMedia.id },
          data: {
            url: input.mediaUrl,
            ...(input.posterUrl !== undefined ? { posterUrl: input.posterUrl } : {}),
            ...(input.mediaType !== undefined ? { type: input.mediaType } : {}),
          },
        });
      }
    }
    return tx.post.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.caption !== undefined ? { caption: input.caption } : {}),
        ...(input.categoryName !== undefined ? { categoryName: input.categoryName } : {}),
        ...(input.dishId !== undefined ? { dishId: input.dishId } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              publishedAt: input.status === 'PUBLISHED' ? existing.publishedAt ?? new Date() : existing.publishedAt,
            }
          : {}),
        ...(input.aspectRatio !== undefined ? { aspectRatio: input.aspectRatio } : {}),
      },
      include: {
        dish: true,
        media: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { likes: true, comments: true } },
      },
    });
  });
  res.json({
    data: jsonValue({
      ...updated,
      likeCount: updated._count.likes,
      commentCount: updated._count.comments,
    }),
  });
});

restaurantAccountRouter.delete('/posts/:id', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const existing = await db.post.findFirst({
    where: { id: req.params.id as string, restaurantId: restaurant.id },
    select: { id: true },
  });
  assert(existing, 404, 'NOT_FOUND', 'Публикация не найдена');
  await db.post.delete({ where: { id: existing.id } });
  res.json({ data: { deleted: true, id: existing.id } });
});

restaurantAccountRouter.post(
  '/media',
  rateLimit('restaurant-media', 60, 3600),
  mediaUpload.single('file'),
  async (req, res) => {
    const restaurant = await resolveOwnedRestaurant(req);
    const kind =
      req.body?.kind === 'IMAGE' ? 'IMAGE' : req.body?.kind === 'VIDEO' ? 'VIDEO' : 'ANY';
    const result = await storeRestaurantMedia(restaurant.id, req.file, kind);
    res.status(201).json({ data: result });
  },
);

restaurantAccountRouter.get('/couriers', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const couriers = await listAffiliatedCouriers(restaurant.id);
  res.json({ data: couriers });
});

restaurantAccountRouter.post('/couriers/invitations', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { identifier } = z.object({ identifier: z.string().trim().min(2).max(200) }).strict().parse(req.body);
  const invited = await inviteCourierToRestaurant({
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    identifier,
  });
  res.status(201).json({ data: invited });
});

restaurantAccountRouter.patch('/couriers/:affiliationId', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const aff = await db.restaurantCourierAffiliation.findFirst({
    where: { id: req.params.affiliationId as string, restaurantId: restaurant.id },
  });
  assert(aff, 404, 'NOT_FOUND', 'Связь с курьером не найдена');
  const { status } = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) }).strict().parse(req.body);
  if (status === 'ACTIVE') {
    assert(aff.acceptedAt, 409, 'COURIER_CONSENT_REQUIRED', 'Курьер должен самостоятельно подтвердить приглашение');
  }
  const updated = await db.restaurantCourierAffiliation.update({
    where: { id: aff.id },
    data: {
      status,
      disabledAt: status === 'DISABLED' ? new Date() : null,
    },
  });
  res.json({ data: jsonValue(updated) });
});

restaurantAccountRouter.get('/deliveries', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  await expireStaleOffersAndRequests(restaurant.id);
  const deliveries = await db.delivery.findMany({
    where: { restaurantId: restaurant.id },
    include: deliveryInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ data: deliveries.map(serializeDelivery) });
});

restaurantAccountRouter.get('/deliveries/:id', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  await expireStaleOffersAndRequests(restaurant.id);
  const id = req.params.id as string;
  const delivery = await db.delivery.findFirst({
    where: { restaurantId: restaurant.id, OR: [{ id }, { orderId: id }] },
    include: deliveryInclude,
  });
  assert(delivery, 404, 'NOT_FOUND', 'Доставка не найдена');
  res.json({ data: serializeDelivery(delivery) });
});

restaurantAccountRouter.post('/deliveries/:orderId/assign-own', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { courierId, rewardAmount, notes } = z
    .object({
      courierId: z.string().min(1).max(100),
      rewardAmount: z.coerce.number().min(0).max(500_000).optional(),
      notes: z.string().trim().max(300).optional(),
    })
    .strict()
    .parse(req.body);

  const updated = await assignOwnCourierToOrder({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.orderId as string,
    courierId,
    rewardAmount,
    notes,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.post('/deliveries/:orderId/request-on-demand', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { rewardAmount, notes } = z
    .object({
      rewardAmount: z.coerce.number().min(0).max(500_000).optional(),
      notes: z.string().trim().max(300).optional(),
    })
    .strict()
    .parse(req.body ?? {});

  const updated = await requestOnDemandCourierForOrder({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.orderId as string,
    rewardAmount,
    notes,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.post('/deliveries/:orderId/cancel-search', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).strict().parse(req.body ?? {});
  const updated = await cancelDeliverySearch({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.orderId as string,
    reason,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.post('/deliveries/:orderId/cancel-assignment', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).strict().parse(req.body);
  const updated = await cancelDeliveryAssignment({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.orderId as string,
    reason,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.post('/deliveries/:orderId/mark-ready', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const updated = await markDeliveryReadyForPickup({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.orderId as string,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.post('/deliveries/:orderId/handover', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { startDelivery } = z.object({ startDelivery: z.boolean().default(false) }).strict().parse(req.body ?? {});
  const updated = await handoverDeliveryToCourier({
    restaurantId: restaurant.id,
    actorId: req.user!.id,
    orderId: req.params.orderId as string,
    startDelivery,
  });
  res.json({ data: updated });
});

restaurantAccountRouter.get('/imports', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const jobs = await db.importJob.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      fileName: true,
      fileFormat: true,
      conflictMode: true,
      status: true,
      totalRows: true,
      addedCount: true,
      updatedCount: true,
      skippedCount: true,
      errorCount: true,
      conflictCount: true,
      createdAt: true,
      completedAt: true,
    },
  });
  res.json({ data: jsonValue(jobs) });
});

restaurantAccountRouter.get('/imports/template', async (req, res) => {
  await resolveOwnedRestaurant(req);
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const file = await buildMenuTemplate(format);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.send(file.buffer);
});

restaurantAccountRouter.post('/imports/preview', sheetUpload.single('file'), async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  assert(req.file, 400, 'FILE_REQUIRED', 'Выберите файл .xlsx или .csv');
  const conflictModeRaw = req.body?.conflictMode;
  const conflictMode: MenuImportConflictMode =
    conflictModeRaw === 'UPDATE_EXISTING' || conflictModeRaw === 'SKIP_EXISTING'
      ? conflictModeRaw
      : 'ADD_NEW';

  let columnMapping: Record<string, string> | undefined;
  if (typeof req.body?.columnMapping === 'string' && req.body.columnMapping.trim()) {
    try {
      columnMapping = JSON.parse(req.body.columnMapping) as Record<string, string>;
    } catch {
      throw new ApiError(400, 'INVALID_MAPPING', 'Некорректное соответствие столбцов');
    }
  }

  const preview = await createMenuImportPreview({
    restaurantId: restaurant.id,
    userId: req.user!.id,
    fileName: req.file.originalname || 'menu.xlsx',
    buffer: req.file.buffer,
    conflictMode,
    columnMapping,
  });
  res.status(201).json({ data: preview });
});

restaurantAccountRouter.post('/imports/:jobId/confirm', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const { createMissingCategories, allowPartial } = z
    .object({
      createMissingCategories: z.boolean().default(true),
      allowPartial: z.boolean().default(true),
    })
    .strict()
    .parse(req.body ?? {});

  const result = await confirmMenuImportJob({
    restaurantId: restaurant.id,
    jobId: req.params.jobId as string,
    createMissingCategories,
    allowPartial,
  });
  invalidateBusinessCache(restaurant.id);
  res.json({ data: result });
});

restaurantAccountRouter.post('/imports/:jobId/cancel', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const job = await db.importJob.findFirst({
    where: { id: req.params.jobId as string, restaurantId: restaurant.id },
  });
  assert(job, 404, 'NOT_FOUND', 'Задача импорта не найдена');
  if (job.status === 'PREVIEW') {
    await db.importJob.update({
      where: { id: job.id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }
  res.json({ data: { cancelled: true, id: job.id } });
});

restaurantAccountRouter.get('/imports/:jobId/errors-export', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const file = await exportImportErrorsSpreadsheet(restaurant.id, req.params.jobId as string, format);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.send(file.buffer);
});

restaurantAccountRouter.get('/exports/menu', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const categoryId = typeof req.query.categoryId === 'string' && req.query.categoryId ? req.query.categoryId : undefined;
  const availability =
    req.query.availability === 'available' || req.query.availability === 'unavailable'
      ? req.query.availability
      : 'all';
  const file = await exportMenuSpreadsheet({
    restaurantId: restaurant.id,
    userId: req.user!.id,
    format,
    categoryId,
    availability,
  });
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.send(file.buffer);
});

restaurantAccountRouter.get('/exports/orders', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const file = await exportOrdersSpreadsheet({
    restaurantId: restaurant.id,
    userId: req.user!.id,
    format,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    paymentMethod: typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : undefined,
    deliveryMode: typeof req.query.deliveryMode === 'string' ? req.query.deliveryMode : undefined,
    includeContacts: req.query.includeContacts === 'true',
  });
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.send(file.buffer);
});

async function computeRestaurantStatistics(
  restaurantId: string,
  fromStr?: string,
  toStr?: string,
  periodText?: string,
): Promise<RestaurantStatisticsDto> {
  const now = new Date();
  const parsedPeriod = periodText
    ? parseDatePeriodFromQuestion(periodText, now)
    : fromStr && !/^\d{4}-\d{2}-\d{2}/.test(fromStr)
      ? parseDatePeriodFromQuestion(fromStr, now)
      : null;
  const effectiveFrom = parsedPeriod?.from ?? fromStr;
  const effectiveTo = parsedPeriod?.to ?? toStr;
  const to = effectiveTo ? new Date(`${effectiveTo.slice(0, 10)}T23:59:59.999Z`) : now;
  const from = effectiveFrom
    ? new Date(`${effectiveFrom.slice(0, 10)}T00:00:00.000Z`)
    : new Date(to.getTime() - 29 * 86_400_000);

  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfDay.getTime() - 6 * 86_400_000);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [allOrders, restaurant, followers, reviews, postsCount, dishesWithCat] = await Promise.all([
    db.order.findMany({
      where: { restaurantId },
      include: {
        items: true,
        payment: true,
        delivery: { select: { mode: true, courierReward: true, status: true } },
      },
    }),
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { id: true } }),
    db.follow.count({ where: { restaurantId } }),
    db.review.findMany({ where: { restaurantId }, select: { rating: true } }),
    db.post.count({ where: { restaurantId } }),
    db.dish.findMany({
      where: { restaurantId },
      select: { id: true, category: { select: { name: true } } },
    }),
  ]);
  void restaurant;

  const dishCategoryMap = new Map(dishesWithCat.map(d => [d.id, d.category.name]));
  const dishAgg = new Map<string, { dishId: string | null; dishName: string; quantity: number; revenue: number }>();
  const catAgg = new Map<string, { categoryName: string; quantity: number; revenue: number }>();

  let ordersToday = 0;
  let ordersWeek = 0;
  let ordersMonth = 0;
  let ordersInRange = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let createdOrdersAmount = 0;
  let paidOrdersAmount = 0;
  let cashConfirmedAmount = 0;
  let cardConfirmedAmount = 0;
  let deliveryExpensesAmount = 0;
  let ownCourierDeliveries = 0;
  let onDemandCourierDeliveries = 0;

  for (const o of allOrders) {
    if (o.createdAt >= startOfDay) ordersToday++;
    if (o.createdAt >= startOfWeek) ordersWeek++;
    if (o.createdAt >= startOfMonth) ordersMonth++;
    if (o.createdAt < from || o.createdAt > to) continue;

    ordersInRange++;
    if (o.status === 'DELIVERED') completedOrders++;
    if (o.status === 'CANCELLED') cancelledOrders++;

    const totalNum = o.total.toNumber();
    if (o.status !== 'CANCELLED') {
      createdOrdersAmount += totalNum;
    }
    if (o.payment?.status === 'PAID') {
      paidOrdersAmount += totalNum;
      if (o.payment.method === 'CASH') cashConfirmedAmount += totalNum;
      else cardConfirmedAmount += totalNum;
    }
    if (o.delivery) {
      if (o.delivery.mode === 'OWN_COURIER') ownCourierDeliveries++;
      else onDemandCourierDeliveries++;
      if (o.delivery.status !== 'CANCELLED' && o.delivery.status !== 'FAILED') {
        deliveryExpensesAmount += o.delivery.courierReward.toNumber();
      }
    }

    if (o.status !== 'CANCELLED') {
      for (const item of o.items) {
        const lineRev = item.unitPrice.toNumber() * item.quantity;
        const key = item.dishId ?? item.dishName;
        const prev = dishAgg.get(key) ?? {
          dishId: item.dishId,
          dishName: item.dishName,
          quantity: 0,
          revenue: 0,
        };
        prev.quantity += item.quantity;
        prev.revenue += lineRev;
        dishAgg.set(key, prev);

        const catName = (item.dishId ? dishCategoryMap.get(item.dishId) : undefined) ?? 'Прочее';
        const cPrev = catAgg.get(catName) ?? { categoryName: catName, quantity: 0, revenue: 0 };
        cPrev.quantity += item.quantity;
        cPrev.revenue += lineRev;
        catAgg.set(catName, cPrev);
      }
    }
  }

  const averageRating = reviews.length
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
    : null;

  return {
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    ordersToday,
    ordersWeek,
    ordersMonth,
    ordersInRange,
    completedOrders,
    cancelledOrders,
    createdOrdersAmount,
    paidOrdersAmount,
    cashConfirmedAmount,
    cardConfirmedAmount,
    deliveryExpensesAmount,
    ownCourierDeliveries,
    onDemandCourierDeliveries,
    followers,
    averageRating,
    reviewCount: reviews.length,
    publicationsCount: postsCount,
    popularDishes: [...dishAgg.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    popularCategories: [...catAgg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  };
}

restaurantAccountRouter.get('/statistics', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const period = typeof req.query.period === 'string' ? req.query.period : undefined;
  const stats = await computeRestaurantStatistics(restaurant.id, from, to, period);
  res.json({ data: stats });
});

restaurantAccountRouter.get('/exports/statistics', async (req, res) => {
  const restaurant = await resolveOwnedRestaurant(req);
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const period = typeof req.query.period === 'string' ? req.query.period : undefined;
  const stats = await computeRestaurantStatistics(restaurant.id, from, to, period);
  const file = await exportStatisticsSpreadsheet({
    restaurantId: restaurant.id,
    userId: req.user!.id,
    format,
    stats,
  });
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.send(file.buffer);
});

restaurantAccountRouter.get('/notifications', async (req, res) => {
  await resolveOwnedRestaurant(req);
  const { page, pageSize } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [items, total, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);
  res.json({
    data: jsonValue(items),
    unreadCount,
    pagination: pageMetadata(page, pageSize, total),
  });
});

restaurantAccountRouter.patch('/notifications/read', async (req, res) => {
  await resolveOwnedRestaurant(req);
  const { id } = z.object({ id: z.string().optional() }).strict().parse(req.body ?? {});
  await db.notification.updateMany({
    where: {
      userId: req.user!.id,
      readAt: null,
      ...(id ? { id } : {}),
    },
    data: { readAt: new Date() },
  });
  res.json({ data: { markedRead: true } });
});
