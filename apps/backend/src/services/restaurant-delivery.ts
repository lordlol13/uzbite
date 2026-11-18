import { randomBytes } from 'node:crypto';
import {
  Prisma,
  type DeliveryStatus,
  type OrderStatus,
  type PaymentStatus,
} from '@prisma/client';
import type {
  AffiliatedCourierDto,
  BusinessHoursDay,
  DeliveryDto,
  RestaurantOrderDto,
  RestaurantProfileDto,
} from '@uzbite/shared';
import { db } from '../config/database.js';
import { ApiError, assert } from '../utils/errors.js';
import { jsonValue } from '../utils/serialize.js';
import { ioEvent } from './realtime.js';
import { notificationDto } from './notifications.js';
import { invalidateBusinessCache } from './business-analytics.js';

export const DEFAULT_BUSINESS_HOURS: BusinessHoursDay[] = [
  { day: 1, label: 'Пн', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 2, label: 'Вт', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 3, label: 'Ср', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 4, label: 'Чт', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 5, label: 'Пт', isOpen: true, openTime: '09:00', closeTime: '23:00', overnight: false },
  { day: 6, label: 'Сб', isOpen: true, openTime: '10:00', closeTime: '23:30', overnight: false },
  { day: 0, label: 'Вс', isOpen: true, openTime: '10:00', closeTime: '22:30', overnight: false },
];

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_ACCEPTANCE: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'DELIVERING', 'CANCELLED'],
  PREPARING: ['DELIVERING', 'CANCELLED'],
  DELIVERING: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  AWAITING_PAYMENT: ['PAID', 'REJECTED'],
  AWAITING_CONFIRMATION: ['PAID', 'REJECTED'],
  PAID: [],
  REJECTED: ['PAID'],
};

export const restaurantProfileInclude = {
  reviews: { select: { rating: true } },
  _count: { select: { reviews: true, follows: true } },
  settings: true,
  deliverySettings: true,
} as const;

export const deliveryInclude = {
  assignedCourier: {
    select: { id: true, name: true, username: true, phone: true, courierAvailability: true },
  },
  requests: {
    orderBy: { createdAt: 'desc' as const },
    take: 3,
    include: { _count: { select: { offers: true } } },
  },
  offers: {
    orderBy: { sentAt: 'desc' as const },
    include: { courier: { select: { name: true, username: true } } },
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} as const;

export const restaurantOrderInclude = {
  items: true,
  payment: { select: { id: true, method: true, status: true, rejectionReason: true, receiptId: true } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  delivery: {
    include: deliveryInclude,
  },
} as const;

type RestaurantProfileRecord = Prisma.RestaurantGetPayload<{ include: typeof restaurantProfileInclude }>;
type RestaurantOrderRecord = Prisma.OrderGetPayload<{ include: typeof restaurantOrderInclude }>;

export function serializeRestaurantProfile(r: RestaurantProfileRecord): RestaurantProfileDto {
  const hours = Array.isArray(r.settings?.businessHours)
    ? (r.settings.businessHours as unknown as BusinessHoursDay[])
    : DEFAULT_BUSINESS_HOURS;
  const rating = r.reviews.length
    ? Math.round((r.reviews.reduce((sum, item) => sum + item.rating, 0) / r.reviews.length) * 10) / 10
    : null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    logoUrl: r.logoUrl,
    coverUrl: r.coverUrl,
    galleryUrls: [...new Set(r.galleryUrls)],
    addressText: r.addressText,
    landmark: r.landmark,
    latitude: r.latitude,
    longitude: r.longitude,
    phone: r.phone,
    telegram: r.telegram,
    isOpen: r.isOpen,
    acceptingOrders: r.acceptingOrders,
    timezone: r.timezone,
    onboardingCompleted: r.onboardingCompleted,
    preparationMinutes: r.preparationMinutes,
    deliveryFee: r.deliveryFee.toNumber(),
    minOrder: r.minOrder.toNumber(),
    acceptCash: r.acceptCash,
    acceptCard: r.acceptCard,
    paymentRecipient: r.paymentRecipient,
    paymentDetails: r.paymentDetails,
    paymentQrUrl: r.paymentQrUrl,
    paymentInstructions: r.paymentInstructions,
    followerCount: r._count.follows,
    rating,
    reviewCount: r._count.reviews,
    settings: {
      businessHours: hours,
      acceptingOrders: r.settings?.acceptingOrders ?? r.acceptingOrders,
      timezone: r.settings?.timezone ?? r.timezone,
      notificationsEnabled: r.settings?.notificationsEnabled ?? true,
    },
    deliverySettings: {
      ownCouriersEnabled: r.deliverySettings?.ownCouriersEnabled ?? true,
      onDemandCouriersEnabled: r.deliverySettings?.onDemandCouriersEnabled ?? true,
      preferredMode: r.deliverySettings?.preferredMode ?? 'OWN_COURIER',
      baseDeliveryFee: r.deliverySettings ? r.deliverySettings.baseDeliveryFee.toNumber() : r.deliveryFee.toNumber(),
      courierRewardFee: r.deliverySettings ? r.deliverySettings.courierRewardFee.toNumber() : 10000,
      offerTimeoutSeconds: r.deliverySettings?.offerTimeoutSeconds ?? 120,
      searchTimeoutSeconds: r.deliverySettings?.searchTimeoutSeconds ?? 300,
      updatedAt: (r.deliverySettings?.updatedAt ?? r.updatedAt).toISOString(),
    },
  };
}

export function serializeDelivery(d: NonNullable<RestaurantOrderRecord['delivery']>): DeliveryDto {
  const activeReq = d.requests[0] ?? null;
  return {
    id: d.id,
    orderId: d.orderId,
    restaurantId: d.restaurantId,
    mode: d.mode,
    assignedCourierId: d.assignedCourierId,
    assignedCourier: d.assignedCourier
      ? {
          id: d.assignedCourier.id,
          name: d.assignedCourier.name,
          username: d.assignedCourier.username,
          phone: d.assignedCourier.phone,
          availability: d.assignedCourier.courierAvailability,
        }
      : null,
    status: d.status,
    pickupAddressSnapshot: (d.pickupAddressSnapshot as Record<string, unknown>) ?? {},
    deliveryAddressSnapshot: (d.deliveryAddressSnapshot as Record<string, unknown>) ?? {},
    deliveryFee: d.deliveryFee.toNumber(),
    courierReward: d.courierReward.toNumber(),
    notes: d.notes,
    offeredAt: d.offeredAt?.toISOString() ?? null,
    assignedAt: d.assignedAt?.toISOString() ?? null,
    acceptedAt: d.acceptedAt?.toISOString() ?? null,
    readyAt: d.readyAt?.toISOString() ?? null,
    pickedUpAt: d.pickedUpAt?.toISOString() ?? null,
    startedAt: d.startedAt?.toISOString() ?? null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    cancelledAt: d.cancelledAt?.toISOString() ?? null,
    cancelReason: d.cancelReason,
    activeRequest: activeReq
      ? {
          id: activeReq.id,
          deliveryId: activeReq.deliveryId,
          status: activeReq.status,
          startedAt: activeReq.startedAt.toISOString(),
          expiresAt: activeReq.expiresAt.toISOString(),
          completedAt: activeReq.completedAt?.toISOString() ?? null,
          acceptedByCourierId: activeReq.acceptedByCourierId,
          failureReason: activeReq.failureReason,
          offersCount: activeReq._count.offers,
        }
      : null,
    offers: d.offers.map(o => ({
      id: o.id,
      requestId: o.requestId,
      deliveryId: o.deliveryId,
      courierId: o.courierId,
      courierName: o.courier.name || o.courier.username,
      mode: o.mode,
      status: o.status,
      rewardAmount: o.rewardAmount.toNumber(),
      sentAt: o.sentAt.toISOString(),
      expiresAt: o.expiresAt.toISOString(),
      respondedAt: o.respondedAt?.toISOString() ?? null,
      rejectionReason: o.rejectionReason,
    })),
    history: d.statusHistory.map(h => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      actorRole: h.actorRole,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function serializeRestaurantOrder(order: RestaurantOrderRecord): RestaurantOrderDto {
  return {
    id: order.id,
    userId: order.userId,
    restaurantId: order.restaurantId,
    restaurantName: order.restaurantName,
    restaurantAddress: order.restaurantAddress,
    addressSnapshot: order.addressSnapshot as unknown as RestaurantOrderDto['addressSnapshot'],
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    subtotal: order.subtotal.toNumber(),
    deliveryFee: order.deliveryFee.toNumber(),
    total: order.total.toNumber(),
    status: order.status,
    items: order.items.map(item => ({
      id: item.id,
      dishId: item.dishId,
      dishName: item.dishName,
      unitPrice: item.unitPrice.toNumber(),
      quantity: item.quantity,
      imageUrl: item.imageUrl,
    })),
    payment: order.payment
      ? {
          id: order.payment.id,
          method: order.payment.method,
          status: order.payment.status,
          rejectionReason: order.payment.rejectionReason,
          receiptId: order.payment.receiptId,
        }
      : null,
    delivery: order.delivery ? serializeDelivery(order.delivery) : null,
    statusHistory: order.statusHistory.map(h => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      actorRole: h.actorRole,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export async function expireStaleOffersAndRequests(restaurantId?: string) {
  const now = new Date();
  const expiredOffers = await db.deliveryOffer.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lte: now },
      ...(restaurantId ? { delivery: { restaurantId } } : {}),
    },
    include: {
      delivery: { select: { id: true, orderId: true, restaurantId: true, status: true, mode: true } },
    },
  });

  for (const offer of expiredOffers) {
    await db.deliveryOffer.updateMany({
      where: { id: offer.id, status: 'PENDING' },
      data: { status: 'EXPIRED', respondedAt: now },
    });
    if (offer.mode === 'OWN_COURIER' && offer.delivery.status === 'OFFERED') {
      const remaining = await db.deliveryOffer.count({
        where: { deliveryId: offer.deliveryId, status: 'PENDING' },
      });
      if (remaining === 0) {
        await db.$transaction(async tx => {
          const updated = await tx.delivery.updateMany({
            where: { id: offer.deliveryId, status: 'OFFERED', assignedCourierId: null },
            data: { status: 'FAILED', cancelReason: 'Срок предложения курьеру истёк' },
          });
          if (updated.count === 1) {
            await tx.deliveryStatusHistory.create({
              data: {
                deliveryId: offer.deliveryId,
                orderId: offer.delivery.orderId,
                actorRole: 'SYSTEM',
                fromStatus: 'OFFERED',
                toStatus: 'FAILED',
                note: 'Курьер не ответил в установленный срок',
              },
            });
          }
        });
        ioEvent(
          [`restaurant:${offer.delivery.restaurantId}`, `delivery:${offer.deliveryId}`, `courier:${offer.courierId}`],
          'delivery:offer_expired',
          { deliveryId: offer.deliveryId, orderId: offer.delivery.orderId, offerId: offer.id },
        );
      }
    }
  }

  const expiredRequests = await db.deliveryRequest.findMany({
    where: {
      status: 'SEARCHING',
      expiresAt: { lte: now },
      ...(restaurantId ? { restaurantId } : {}),
    },
    include: {
      restaurant: { select: { ownerId: true } },
      delivery: { select: { id: true, orderId: true } },
    },
  });

  for (const req of expiredRequests) {
    await db.$transaction(async tx => {
      const updatedReq = await tx.deliveryRequest.updateMany({
        where: { id: req.id, status: 'SEARCHING' },
        data: { status: 'EXPIRED', completedAt: now, failureReason: 'Время поиска курьера истекло' },
      });
      if (updatedReq.count === 1) {
        await tx.deliveryOffer.updateMany({
          where: { requestId: req.id, status: 'PENDING' },
          data: { status: 'EXPIRED', respondedAt: now },
        });
        await tx.delivery.updateMany({
          where: { id: req.deliveryId, status: 'SEARCHING', assignedCourierId: null },
          data: { status: 'FAILED', cancelReason: 'Ни один свободный курьер не принял заявку вовремя' },
        });
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: req.deliveryId,
            orderId: req.delivery.orderId,
            actorRole: 'SYSTEM',
            fromStatus: 'SEARCHING',
            toStatus: 'FAILED',
            note: 'Поиск заказного курьера завершился без результата',
          },
        });
        if (req.restaurant.ownerId) {
          await tx.notification.create({
            data: {
              userId: req.restaurant.ownerId,
              type: 'DELIVERY_SEARCH_EXPIRED',
              title: 'Курьер не найден',
              body: `Время поиска курьера для заказа #${req.delivery.orderId.slice(-6)} истекло`,
              link: `/orders/${req.delivery.orderId}`,
              metadata: { orderId: req.delivery.orderId, deliveryId: req.deliveryId },
            },
          });
        }
      }
    });
    ioEvent(
      [`restaurant:${req.restaurantId}`, `delivery:${req.deliveryId}`, `order:${req.delivery.orderId}`],
      'delivery:offer_expired',
      { deliveryId: req.deliveryId, orderId: req.delivery.orderId, requestId: req.id },
    );
  }
}

async function emitCustomerAndRestaurantOrderUpdates(orderId: string, eventName: string) {
  const full = await db.order.findUnique({
    where: { id: orderId },
    include: restaurantOrderInclude,
  });
  if (!full) return null;
  const serialized = serializeRestaurantOrder(full);
  ioEvent([`user:${full.userId}`, `order:${full.id}`], 'order:updated', jsonValue(full));
  ioEvent([`restaurant:${full.restaurantId}`, `order:${full.id}`], eventName, serialized);
  ioEvent(`restaurant:${full.restaurantId}`, 'order:updated', serialized);
  return serialized;
}

export async function confirmOrderPayment(params: {
  restaurantId: string;
  actorId: string;
  paymentId: string;
}) {
  const result = await db.$transaction(async tx => {
    const payment = await tx.payment.findFirst({
      where: { id: params.paymentId, order: { restaurantId: params.restaurantId } },
      include: { order: { include: { user: { select: { settings: { select: { language: true } } } } } } },
    });
    assert(payment, 404, 'NOT_FOUND', 'Платёж не найден');
    assert(payment.order.status !== 'CANCELLED', 409, 'ORDER_CANCELLED', 'Заказ отменён');
    assert(
      PAYMENT_TRANSITIONS[payment.status].includes('PAID'),
      409,
      'INVALID_PAYMENT_TRANSITION',
      'Оплату в текущем статусе нельзя подтвердить',
    );
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', rejectionReason: null },
    });
    const notice = await tx.notification.create({
      data: {
        userId: payment.order.userId,
        type: 'PAYMENT_STATUS',
        title: 'Статус оплаты обновлён',
        body: payment.order.restaurantName,
        link: '/orders',
        metadata: {
          orderId: payment.orderId,
          restaurantName: payment.order.restaurantName,
          paymentStatus: 'PAID',
        },
      },
    });
    return {
      payment: updated,
      orderId: payment.orderId,
      customerId: payment.order.userId,
      language: payment.order.user.settings?.language,
      notice,
    };
  });

  invalidateBusinessCache(params.restaurantId);
  ioEvent(
    [`user:${result.customerId}`, `order:${result.orderId}`, `restaurant:${params.restaurantId}`],
    'payment:confirmed',
    { orderId: result.orderId, payment: jsonValue(result.payment) },
  );
  ioEvent(`user:${result.customerId}`, 'payment:updated', {
    orderId: result.orderId,
    payment: jsonValue(result.payment),
  });
  ioEvent(`user:${result.customerId}`, 'notification', notificationDto(result.notice, result.language));
  return emitCustomerAndRestaurantOrderUpdates(result.orderId, 'order:status_updated');
}

export async function rejectOrderPayment(params: {
  restaurantId: string;
  actorId: string;
  paymentId: string;
  reason: string;
}) {
  const cleanReason = params.reason.trim();
  assert(
    cleanReason.length >= 3 && cleanReason.length <= 500,
    400,
    'PAYMENT_REASON_REQUIRED',
    'Укажите причину отклонения оплаты (от 3 до 500 символов)',
  );

  const result = await db.$transaction(async tx => {
    const payment = await tx.payment.findFirst({
      where: { id: params.paymentId, order: { restaurantId: params.restaurantId } },
      include: { order: { include: { user: { select: { settings: { select: { language: true } } } } } } },
    });
    assert(payment, 404, 'NOT_FOUND', 'Платёж не найден');
    assert(
      PAYMENT_TRANSITIONS[payment.status].includes('REJECTED'),
      409,
      'INVALID_PAYMENT_TRANSITION',
      'Оплату в текущем статусе нельзя отклонить',
    );
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'REJECTED', rejectionReason: cleanReason },
    });
    const notice = await tx.notification.create({
      data: {
        userId: payment.order.userId,
        type: 'PAYMENT_STATUS',
        title: 'Статус оплаты обновлён',
        body: payment.order.restaurantName,
        link: '/orders',
        metadata: {
          orderId: payment.orderId,
          restaurantName: payment.order.restaurantName,
          paymentStatus: 'REJECTED',
          rejectionReason: cleanReason,
        },
      },
    });
    return {
      payment: updated,
      orderId: payment.orderId,
      customerId: payment.order.userId,
      language: payment.order.user.settings?.language,
      notice,
    };
  });

  invalidateBusinessCache(params.restaurantId);
  ioEvent(
    [`user:${result.customerId}`, `order:${result.orderId}`, `restaurant:${params.restaurantId}`],
    'payment:rejected',
    { orderId: result.orderId, payment: jsonValue(result.payment) },
  );
  ioEvent(`user:${result.customerId}`, 'payment:updated', {
    orderId: result.orderId,
    payment: jsonValue(result.payment),
  });
  ioEvent(`user:${result.customerId}`, 'notification', notificationDto(result.notice, result.language));
  return emitCustomerAndRestaurantOrderUpdates(result.orderId, 'order:status_updated');
}

export async function transitionRestaurantOrderStatus(params: {
  restaurantId: string;
  actorId: string;
  orderId: string;
  nextStatus: OrderStatus;
  note?: string;
}) {
  const result = await db.$transaction(
    async tx => {
      const order = await tx.order.findFirst({
        where: { id: params.orderId, restaurantId: params.restaurantId },
        include: {
          payment: true,
          delivery: true,
          restaurant: { include: { deliverySettings: true } },
          user: { select: { settings: { select: { language: true } } } },
        },
      });
      assert(order, 404, 'NOT_FOUND', 'Заказ не найден');
      assert(
        ORDER_TRANSITIONS[order.status].includes(params.nextStatus),
        409,
        'INVALID_TRANSITION',
        `Недопустимый переход статуса: ${order.status} → ${params.nextStatus}`,
      );

      if (params.nextStatus === 'ACCEPTED' && order.restaurant.deliverySettings) {
        assert(
          order.restaurant.deliverySettings.ownCouriersEnabled ||
            order.restaurant.deliverySettings.onDemandCouriersEnabled,
          409,
          'DELIVERY_NOT_CONFIGURED',
          'Включите хотя бы один способ доставки перед принятием заказов',
        );
      }

      if (
        order.payment?.method === 'CARD' &&
        ['ACCEPTED', 'PREPARING', 'DELIVERING', 'DELIVERED'].includes(params.nextStatus)
      ) {
        assert(
          order.payment.status === 'PAID',
          409,
          'PAYMENT_REQUIRED',
          'Сначала подтвердите поступление оплаты картой',
        );
      }

      if (params.nextStatus === 'DELIVERING') {
        assert(
          order.delivery &&
            order.delivery.assignedCourierId &&
            ['COURIER_ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY'].includes(order.delivery.status),
          409,
          'COURIER_REQUIRED',
          'Нельзя перевести заказ в доставку до назначения и подтверждения курьера',
        );
      }

      if (params.nextStatus === 'DELIVERED' && order.delivery) {
        assert(
          order.delivery.assignedCourierId &&
            ['PICKED_UP', 'ON_THE_WAY', 'DELIVERED'].includes(order.delivery.status),
          409,
          'PICKUP_REQUIRED',
          'Заказ ещё не передан курьеру',
        );
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: params.nextStatus },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          actorId: params.actorId,
          actorRole: 'RESTAURANT',
          fromStatus: order.status,
          toStatus: params.nextStatus,
          note: params.note?.trim() || null,
        },
      });

      if (params.nextStatus === 'CANCELLED' && order.delivery && !['DELIVERED', 'CANCELLED'].includes(order.delivery.status)) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: params.note?.trim() || 'Заказ отменён рестораном' },
        });
        await tx.deliveryRequest.updateMany({
          where: { deliveryId: order.delivery.id, status: 'SEARCHING' },
          data: { status: 'CANCELLED', completedAt: new Date(), failureReason: 'Заказ отменён' },
        });
        await tx.deliveryOffer.updateMany({
          where: { deliveryId: order.delivery.id, status: 'PENDING' },
          data: { status: 'CANCELLED', respondedAt: new Date() },
        });
        await tx.courierAssignment.updateMany({
          where: { deliveryId: order.delivery.id, isActive: true },
          data: { isActive: false, cancelledAt: new Date(), cancelReason: 'Заказ отменён рестораном' },
        });
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: order.delivery.id,
            orderId: order.id,
            actorId: params.actorId,
            actorRole: 'RESTAURANT',
            fromStatus: order.delivery.status,
            toStatus: 'CANCELLED',
            note: params.note?.trim() || 'Заказ отменён',
          },
        });
      }

      const notice = await tx.notification.create({
        data: {
          userId: order.userId,
          type: 'ORDER_STATUS',
          title: 'Статус заказа обновлён',
          body: `${order.restaurantName}: ${params.nextStatus}`,
          link: '/orders',
          metadata: { orderId: order.id, restaurantName: order.restaurantName, status: params.nextStatus },
        },
      });

      return {
        orderId: order.id,
        customerId: order.userId,
        language: order.user.settings?.language,
        notice,
        deliveryCourierId: order.delivery?.assignedCourierId ?? null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  invalidateBusinessCache(params.restaurantId);
  ioEvent(`user:${result.customerId}`, 'notification', notificationDto(result.notice, result.language));
  if (params.nextStatus === 'CANCELLED' && result.deliveryCourierId) {
    ioEvent(`courier:${result.deliveryCourierId}`, 'delivery:cancelled', {
      orderId: result.orderId,
      reason: params.note ?? 'Заказ отменён',
    });
  }
  return emitCustomerAndRestaurantOrderUpdates(
    result.orderId,
    params.nextStatus === 'ACCEPTED' ? 'order:accepted' : 'order:status_updated',
  );
}

export async function inviteCourierToRestaurant(params: {
  restaurantId: string;
  restaurantName: string;
  identifier: string;
}) {
  const clean = params.identifier.trim().toLowerCase();
  assert(clean.length >= 2, 400, 'VALIDATION', 'Укажите email, никнейм или ID курьера');

  const courier = await db.user.findFirst({
    where: {
      role: 'COURIER',
      OR: [{ email: clean }, { username: clean }, { id: params.identifier.trim() }],
    },
    select: { id: true, name: true, username: true, email: true, phone: true, courierAvailability: true },
  });
  assert(courier, 404, 'COURIER_NOT_FOUND', 'Курьер с указанными данными не найден');

  const existing = await db.restaurantCourierAffiliation.findUnique({
    where: { restaurantId_courierId: { restaurantId: params.restaurantId, courierId: courier.id } },
  });
  if (existing && existing.status === 'ACTIVE') {
    throw new ApiError(409, 'ALREADY_AFFILIATED', 'Этот курьер уже прикреплён к ресторану');
  }

  const inviteCode = `UZB-${randomBytes(3).toString('hex').toUpperCase()}`;
  const affiliation = await db.restaurantCourierAffiliation.upsert({
    where: { restaurantId_courierId: { restaurantId: params.restaurantId, courierId: courier.id } },
    create: {
      restaurantId: params.restaurantId,
      courierId: courier.id,
      inviteCode,
      status: 'INVITED',
      availability: courier.courierAvailability,
    },
    update: {
      inviteCode,
      status: 'INVITED',
      invitedAt: new Date(),
      disabledAt: null,
    },
  });

  const notice = await db.notification.create({
    data: {
      userId: courier.id,
      type: 'COURIER_INVITATION',
      title: 'Приглашение в ресторан',
      body: `${params.restaurantName} приглашает вас в команду собственных курьеров (код: ${inviteCode})`,
      link: '/affiliations',
      metadata: { restaurantId: params.restaurantId, restaurantName: params.restaurantName, inviteCode },
    },
  });
  ioEvent(`courier:${courier.id}`, 'notification:created', jsonValue(notice));

  return {
    affiliationId: affiliation.id,
    inviteCode,
    status: affiliation.status,
    courier,
  };
}

export async function listAffiliatedCouriers(restaurantId: string): Promise<AffiliatedCourierDto[]> {
  const rows = await db.restaurantCourierAffiliation.findMany({
    where: { restaurantId },
    include: {
      courier: {
        select: {
          id: true,
          name: true,
          username: true,
          phone: true,
          courierAvailability: true,
          courierAssignments: {
            where: { restaurantId },
            orderBy: { assignedAt: 'desc' },
            take: 1,
            include: { delivery: { select: { status: true } } },
          },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { invitedAt: 'desc' }],
  });

  return rows.map(row => {
    const last = row.courier.courierAssignments[0];
    return {
      id: row.courier.id,
      affiliationId: row.id,
      courierId: row.courier.id,
      name: row.courier.name,
      username: row.courier.username,
      phone: row.courier.phone,
      inviteCode: row.inviteCode,
      status: row.status,
      availability: row.courier.courierAvailability,
      activeLoad: row.activeLoad,
      lastAssignmentStatus: last?.delivery.status ?? null,
      lastAssignedAt: last?.assignedAt.toISOString() ?? null,
      invitedAt: row.invitedAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
    };
  });
}

export async function assignOwnCourierToOrder(params: {
  restaurantId: string;
  actorId: string;
  orderId: string;
  courierId: string;
  rewardAmount?: number;
  notes?: string;
}) {
  await expireStaleOffersAndRequests(params.restaurantId);

  const outcome = await db.$transaction(
    async tx => {
      const order = await tx.order.findFirst({
        where: { id: params.orderId, restaurantId: params.restaurantId },
        include: {
          restaurant: { include: { deliverySettings: true } },
          delivery: true,
        },
      });
      assert(order, 404, 'NOT_FOUND', 'Заказ не найден');
      assert(
        ['ACCEPTED', 'PREPARING'].includes(order.status),
        409,
        'ORDER_STATUS_INVALID',
        'Назначить курьера можно только для принятого или готовящегося заказа',
      );
      const settings = order.restaurant.deliverySettings;
      if (settings) {
        assert(settings.ownCouriersEnabled, 409, 'OWN_COURIER_DISABLED', 'Доставка своими курьерами отключена в настройках');
      }

      const affiliation = await tx.restaurantCourierAffiliation.findUnique({
        where: { restaurantId_courierId: { restaurantId: params.restaurantId, courierId: params.courierId } },
        include: { courier: { select: { id: true, name: true, role: true, courierAvailability: true } } },
      });
      assert(
        affiliation && affiliation.status === 'ACTIVE' && affiliation.courier.role === 'COURIER',
        409,
        'COURIER_NOT_AFFILIATED',
        'Курьер не прикреплён к вашему ресторану или не подтвердил привязку',
      );
      assert(
        affiliation.courier.courierAvailability === 'AVAILABLE',
        409,
        'COURIER_UNAVAILABLE',
        'Выбранный курьер сейчас недоступен для назначения',
      );

      if (order.delivery) {
        const activeAssign = await tx.courierAssignment.findFirst({
          where: { deliveryId: order.delivery.id, isActive: true },
        });
        assert(!activeAssign, 409, 'ALREADY_ASSIGNED', 'К этому заказу уже прикреплён активный курьер');
        const activeSearch = await tx.deliveryRequest.findFirst({
          where: { deliveryId: order.delivery.id, status: 'SEARCHING' },
        });
        assert(
          !activeSearch,
          409,
          'SEARCH_IN_PROGRESS',
          'Сначала отмените активный поиск заказного курьера',
        );
      }

      const now = new Date();
      const timeoutSec = settings?.offerTimeoutSeconds ?? 120;
      const expiresAt = new Date(now.getTime() + timeoutSec * 1000);
      const reward = new Prisma.Decimal(
        params.rewardAmount ?? settings?.courierRewardFee.toNumber() ?? 10000,
      );
      const pickupSnapshot = {
        restaurantName: order.restaurant.name,
        addressText: order.restaurant.addressText,
        latitude: order.restaurant.latitude,
        longitude: order.restaurant.longitude,
        phone: order.restaurant.phone,
      };

      const delivery = order.delivery
        ? await tx.delivery.update({
            where: { id: order.delivery.id },
            data: {
              mode: 'OWN_COURIER',
              assignedCourierId: null,
              status: 'OFFERED',
              courierReward: reward,
              notes: params.notes?.trim() || order.delivery.notes,
              offeredAt: now,
              cancelledAt: null,
              cancelReason: null,
            },
          })
        : await tx.delivery.create({
            data: {
              orderId: order.id,
              restaurantId: params.restaurantId,
              mode: 'OWN_COURIER',
              status: 'OFFERED',
              pickupAddressSnapshot: pickupSnapshot,
              deliveryAddressSnapshot: order.addressSnapshot as Prisma.InputJsonValue,
              deliveryFee: order.deliveryFee,
              courierReward: reward,
              notes: params.notes?.trim() || null,
              offeredAt: now,
            },
          });

      await tx.deliveryOffer.updateMany({
        where: { deliveryId: delivery.id, status: 'PENDING' },
        data: { status: 'CANCELLED', respondedAt: now },
      });

      const offer = await tx.deliveryOffer.create({
        data: {
          deliveryId: delivery.id,
          courierId: params.courierId,
          mode: 'OWN_COURIER',
          status: 'PENDING',
          rewardAmount: reward,
          sentAt: now,
          expiresAt,
        },
      });

      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: delivery.id,
          orderId: order.id,
          actorId: params.actorId,
          actorRole: 'RESTAURANT',
          fromStatus: order.delivery?.status ?? null,
          toStatus: 'OFFERED',
          note: `Предложение отправлено собственному курьеру ${affiliation.courier.name}`,
          metadata: { courierId: params.courierId, offerId: offer.id },
        },
      });

      return { delivery, offer, orderId: order.id, courierId: params.courierId };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  ioEvent(`courier:${outcome.courierId}`, 'delivery:offer_created', {
    offerId: outcome.offer.id,
    deliveryId: outcome.delivery.id,
    orderId: outcome.orderId,
    mode: 'OWN_COURIER',
    rewardAmount: outcome.offer.rewardAmount.toNumber(),
    expiresAt: outcome.offer.expiresAt.toISOString(),
  });
  return emitCustomerAndRestaurantOrderUpdates(outcome.orderId, 'delivery:offer_created');
}

export async function requestOnDemandCourierForOrder(params: {
  restaurantId: string;
  actorId: string;
  orderId: string;
  rewardAmount?: number;
  notes?: string;
}) {
  await expireStaleOffersAndRequests(params.restaurantId);

  const outcome = await db.$transaction(
    async tx => {
      const order = await tx.order.findFirst({
        where: { id: params.orderId, restaurantId: params.restaurantId },
        include: {
          restaurant: { include: { deliverySettings: true } },
          delivery: true,
        },
      });
      assert(order, 404, 'NOT_FOUND', 'Заказ не найден');
      assert(
        ['ACCEPTED', 'PREPARING'].includes(order.status),
        409,
        'ORDER_STATUS_INVALID',
        'Поиск курьера доступен для принятого или готовящегося заказа',
      );
      const settings = order.restaurant.deliverySettings;
      if (settings) {
        assert(
          settings.onDemandCouriersEnabled,
          409,
          'ON_DEMAND_DISABLED',
          'Заказные курьеры UzBite отключены в настройках',
        );
      }

      if (order.delivery) {
        const activeAssign = await tx.courierAssignment.findFirst({
          where: { deliveryId: order.delivery.id, isActive: true },
        });
        assert(!activeAssign, 409, 'ALREADY_ASSIGNED', 'К заказу уже прикреплён курьер');
        const activeSearch = await tx.deliveryRequest.findFirst({
          where: { deliveryId: order.delivery.id, status: 'SEARCHING' },
        });
        assert(!activeSearch, 409, 'SEARCH_ALREADY_ACTIVE', 'Поиск курьера уже запущен');
      }

      const now = new Date();
      const timeoutSec = settings?.searchTimeoutSeconds ?? 300;
      const expiresAt = new Date(now.getTime() + timeoutSec * 1000);
      const reward = new Prisma.Decimal(
        params.rewardAmount ?? settings?.courierRewardFee.toNumber() ?? 10000,
      );
      const pickupSnapshot = {
        restaurantName: order.restaurant.name,
        addressText: order.restaurant.addressText,
        latitude: order.restaurant.latitude,
        longitude: order.restaurant.longitude,
        phone: order.restaurant.phone,
      };

      const delivery = order.delivery
        ? await tx.delivery.update({
            where: { id: order.delivery.id },
            data: {
              mode: 'ON_DEMAND_COURIER',
              assignedCourierId: null,
              status: 'SEARCHING',
              courierReward: reward,
              notes: params.notes?.trim() || order.delivery.notes,
              offeredAt: now,
              cancelledAt: null,
              cancelReason: null,
            },
          })
        : await tx.delivery.create({
            data: {
              orderId: order.id,
              restaurantId: params.restaurantId,
              mode: 'ON_DEMAND_COURIER',
              status: 'SEARCHING',
              pickupAddressSnapshot: pickupSnapshot,
              deliveryAddressSnapshot: order.addressSnapshot as Prisma.InputJsonValue,
              deliveryFee: order.deliveryFee,
              courierReward: reward,
              notes: params.notes?.trim() || null,
              offeredAt: now,
            },
          });

      await tx.deliveryOffer.updateMany({
        where: { deliveryId: delivery.id, status: 'PENDING' },
        data: { status: 'CANCELLED', respondedAt: now },
      });

      const request = await tx.deliveryRequest.create({
        data: {
          deliveryId: delivery.id,
          restaurantId: params.restaurantId,
          status: 'SEARCHING',
          startedAt: now,
          expiresAt,
        },
      });

      const availableCouriers = await tx.user.findMany({
        where: {
          role: 'COURIER',
          courierAvailability: 'AVAILABLE',
          courierAssignments: { none: { isActive: true } },
        },
        select: { id: true },
        take: 50,
      });

      const offers = [];
      for (const c of availableCouriers) {
        const offer = await tx.deliveryOffer.create({
          data: {
            requestId: request.id,
            deliveryId: delivery.id,
            courierId: c.id,
            mode: 'ON_DEMAND_COURIER',
            status: 'PENDING',
            rewardAmount: reward,
            sentAt: now,
            expiresAt,
          },
        });
        offers.push(offer);
      }

      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: delivery.id,
          orderId: order.id,
          actorId: params.actorId,
          actorRole: 'RESTAURANT',
          fromStatus: order.delivery?.status ?? null,
          toStatus: 'SEARCHING',
          note:
            offers.length > 0
              ? `Поиск свободного курьера запущен (отправлено предложений: ${offers.length})`
              : 'Поиск открыт, ожидается появление свободных курьеров',
          metadata: { requestId: request.id, offersCount: offers.length },
        },
      });

      return { delivery, request, offers, orderId: order.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  ioEvent(`restaurant:${params.restaurantId}`, 'delivery:search_started', {
    deliveryId: outcome.delivery.id,
    orderId: outcome.orderId,
    requestId: outcome.request.id,
    offersCount: outcome.offers.length,
  });

  for (const offer of outcome.offers) {
    ioEvent(`courier:${offer.courierId}`, 'delivery:offer_created', {
      offerId: offer.id,
      requestId: outcome.request.id,
      deliveryId: outcome.delivery.id,
      orderId: outcome.orderId,
      mode: 'ON_DEMAND_COURIER',
      rewardAmount: offer.rewardAmount.toNumber(),
      expiresAt: offer.expiresAt.toISOString(),
    });
  }

  return emitCustomerAndRestaurantOrderUpdates(outcome.orderId, 'delivery:search_started');
}

export async function cancelDeliverySearch(params: {
  restaurantId: string;
  actorId: string;
  orderId: string;
  reason?: string;
}) {
  const result = await db.$transaction(async tx => {
    const delivery = await tx.delivery.findFirst({
      where: { orderId: params.orderId, restaurantId: params.restaurantId },
    });
    assert(delivery, 404, 'NOT_FOUND', 'Доставка не найдена');
    assert(
      delivery.status === 'SEARCHING' || delivery.status === 'OFFERED',
      409,
      'CANNOT_CANCEL_SEARCH',
      'Активный поиск или предложение отсутствует',
    );
    const now = new Date();
    const pendingOffers = await tx.deliveryOffer.findMany({
      where: { deliveryId: delivery.id, status: 'PENDING' },
      select: { courierId: true },
    });
    await tx.deliveryRequest.updateMany({
      where: { deliveryId: delivery.id, status: 'SEARCHING' },
      data: { status: 'CANCELLED', completedAt: now, failureReason: params.reason?.trim() || 'Отменено рестораном' },
    });
    await tx.deliveryOffer.updateMany({
      where: { deliveryId: delivery.id, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: now },
    });
    await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: params.reason?.trim() || 'Поиск отменён рестораном' },
    });
    await tx.deliveryStatusHistory.create({
      data: {
        deliveryId: delivery.id,
        orderId: delivery.orderId,
        actorId: params.actorId,
        actorRole: 'RESTAURANT',
        fromStatus: delivery.status,
        toStatus: 'CANCELLED',
        note: params.reason?.trim() || 'Поиск курьера отменён рестораном',
      },
    });
    return {
      deliveryId: delivery.id,
      orderId: delivery.orderId,
      courierIds: [...new Set(pendingOffers.map(o => o.courierId))],
    };
  });

  for (const cid of result.courierIds) {
    ioEvent(`courier:${cid}`, 'delivery:cancelled', {
      deliveryId: result.deliveryId,
      orderId: result.orderId,
    });
  }
  return emitCustomerAndRestaurantOrderUpdates(result.orderId, 'delivery:cancelled');
}

export async function cancelDeliveryAssignment(params: {
  restaurantId: string;
  actorId: string;
  orderId: string;
  reason: string;
}) {
  const cleanReason = params.reason.trim();
  assert(cleanReason.length >= 3, 400, 'REASON_REQUIRED', 'Укажите причину отмены назначения');

  const result = await db.$transaction(async tx => {
    const delivery = await tx.delivery.findFirst({
      where: { orderId: params.orderId, restaurantId: params.restaurantId },
    });
    assert(delivery, 404, 'NOT_FOUND', 'Доставка не найдена');
    assert(
      !['PICKED_UP', 'ON_THE_WAY', 'DELIVERED'].includes(delivery.status),
      409,
      'ALREADY_HANDED_OVER',
      'Заказ уже передан курьеру; нельзя снять назначение напрямую',
    );
    assert(delivery.assignedCourierId, 409, 'NO_COURIER_ASSIGNED', 'Курьер ещё не назначен');

    const prevCourierId = delivery.assignedCourierId;
    const now = new Date();
    await tx.courierAssignment.updateMany({
      where: { deliveryId: delivery.id, isActive: true },
      data: { isActive: false, cancelledAt: now, cancelReason: cleanReason },
    });
    if (delivery.mode === 'OWN_COURIER') {
      await tx.restaurantCourierAffiliation.updateMany({
        where: { restaurantId: params.restaurantId, courierId: prevCourierId, activeLoad: { gt: 0 } },
        data: { activeLoad: { decrement: 1 } },
      });
    }
    await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        assignedCourierId: null,
        status: 'CANCELLED',
        cancelledAt: now,
        cancelReason: cleanReason,
      },
    });
    await tx.deliveryStatusHistory.create({
      data: {
        deliveryId: delivery.id,
        orderId: delivery.orderId,
        actorId: params.actorId,
        actorRole: 'RESTAURANT',
        fromStatus: delivery.status,
        toStatus: 'CANCELLED',
        note: `Назначение курьера отменено: ${cleanReason}`,
      },
    });
    return { deliveryId: delivery.id, orderId: delivery.orderId, prevCourierId };
  });

  ioEvent(`courier:${result.prevCourierId}`, 'delivery:cancelled', {
    deliveryId: result.deliveryId,
    orderId: result.orderId,
    reason: cleanReason,
  });
  return emitCustomerAndRestaurantOrderUpdates(result.orderId, 'delivery:cancelled');
}

export async function markDeliveryReadyForPickup(params: {
  restaurantId: string;
  actorId: string;
  orderId: string;
}) {
  const result = await db.$transaction(async tx => {
    const delivery = await tx.delivery.findFirst({
      where: { orderId: params.orderId, restaurantId: params.restaurantId },
    });
    assert(delivery, 404, 'NOT_FOUND', 'Доставка не найдена');
    assert(
      delivery.assignedCourierId && ['ASSIGNED', 'COURIER_ACCEPTED'].includes(delivery.status),
      409,
      'INVALID_DELIVERY_STATUS',
      'Сначала дождитесь подтверждения курьера',
    );
    const now = new Date();
    await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: 'READY_FOR_PICKUP', readyAt: now },
    });
    await tx.deliveryStatusHistory.create({
      data: {
        deliveryId: delivery.id,
        orderId: delivery.orderId,
        actorId: params.actorId,
        actorRole: 'RESTAURANT',
        fromStatus: delivery.status,
        toStatus: 'READY_FOR_PICKUP',
        note: 'Заказ готов к выдаче курьеру',
      },
    });
    return { deliveryId: delivery.id, orderId: delivery.orderId, courierId: delivery.assignedCourierId };
  });

  ioEvent([`courier:${result.courierId}`, `delivery:${result.deliveryId}`], 'delivery:pickup_ready', {
    deliveryId: result.deliveryId,
    orderId: result.orderId,
  });
  return emitCustomerAndRestaurantOrderUpdates(result.orderId, 'delivery:pickup_ready');
}

export async function handoverDeliveryToCourier(params: {
  restaurantId: string;
  actorId: string;
  orderId: string;
  startDelivery?: boolean;
}) {
  const result = await db.$transaction(async tx => {
    const order = await tx.order.findFirst({
      where: { id: params.orderId, restaurantId: params.restaurantId },
      include: { delivery: true, user: { select: { settings: { select: { language: true } } } } },
    });
    assert(order && order.delivery, 404, 'NOT_FOUND', 'Доставка для заказа не найдена');
    const delivery = order.delivery;
    assert(
      delivery.assignedCourierId && ['COURIER_ACCEPTED', 'READY_FOR_PICKUP'].includes(delivery.status),
      409,
      'INVALID_DELIVERY_STATUS',
      'Заказ ещё не подтверждён курьером или уже передан',
    );
    const now = new Date();
    const targetDeliveryStatus: DeliveryStatus = params.startDelivery ? 'ON_THE_WAY' : 'PICKED_UP';
    await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status: targetDeliveryStatus,
        pickedUpAt: now,
        ...(params.startDelivery ? { startedAt: now } : {}),
      },
    });
    await tx.courierAssignment.updateMany({
      where: { deliveryId: delivery.id, isActive: true },
      data: { pickedUpAt: now },
    });
    await tx.deliveryStatusHistory.create({
      data: {
        deliveryId: delivery.id,
        orderId: order.id,
        actorId: params.actorId,
        actorRole: 'RESTAURANT',
        fromStatus: delivery.status,
        toStatus: targetDeliveryStatus,
        note: params.startDelivery ? 'Заказ передан курьеру и отправлен покупателю' : 'Заказ передан курьеру',
      },
    });

    let notice = null;
    if (params.startDelivery && order.status !== 'DELIVERING') {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'DELIVERING' },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          actorId: params.actorId,
          actorRole: 'RESTAURANT',
          fromStatus: order.status,
          toStatus: 'DELIVERING',
          note: 'Передан курьеру, в пути к покупателю',
        },
      });
      notice = await tx.notification.create({
        data: {
          userId: order.userId,
          type: 'ORDER_STATUS',
          title: 'Статус заказа обновлён',
          body: `${order.restaurantName}: DELIVERING`,
          link: '/orders',
          metadata: { orderId: order.id, restaurantName: order.restaurantName, status: 'DELIVERING' },
        },
      });
    }
    return {
      deliveryId: delivery.id,
      orderId: order.id,
      courierId: delivery.assignedCourierId,
      customerId: order.userId,
      language: order.user.settings?.language,
      notice,
      targetDeliveryStatus,
    };
  });

  ioEvent([`courier:${result.courierId}`, `delivery:${result.deliveryId}`], 'delivery:picked_up', {
    deliveryId: result.deliveryId,
    orderId: result.orderId,
    status: result.targetDeliveryStatus,
  });
  if (result.notice) {
    ioEvent(`user:${result.customerId}`, 'notification', notificationDto(result.notice, result.language));
  }
  return emitCustomerAndRestaurantOrderUpdates(result.orderId, 'delivery:picked_up');
}

export async function courierAcceptOffer(params: { courierId: string; offerId: string }) {
  const result = await db.$transaction(
    async tx => {
      const offer = await tx.deliveryOffer.findFirst({
        where: { id: params.offerId, courierId: params.courierId },
        include: {
          delivery: { include: { restaurant: { select: { ownerId: true, name: true } } } },
          courier: { select: { id: true, name: true, username: true, courierAvailability: true } },
        },
      });
      assert(offer, 404, 'NOT_FOUND', 'Предложение доставки не найдено');
      assert(offer.status === 'PENDING', 409, 'ALREADY_ASSIGNED', 'Этот заказ уже принят другим курьером или отменён');

      const now = new Date();
      if (offer.expiresAt <= now) {
        await tx.deliveryOffer.update({
          where: { id: offer.id },
          data: { status: 'EXPIRED', respondedAt: now },
        });
        throw new ApiError(409, 'OFFER_EXPIRED', 'Срок действия предложения истёк');
      }

      assert(
        offer.courier.courierAvailability === 'AVAILABLE',
        409,
        'COURIER_NOT_AVAILABLE',
        'Переключите статус доступности в "Доступен", чтобы принять заказ',
      );

      if (offer.requestId) {
        const reqLock = await tx.deliveryRequest.updateMany({
          where: { id: offer.requestId, status: 'SEARCHING' },
          data: { status: 'ACCEPTED', acceptedByCourierId: params.courierId, completedAt: now },
        });
        if (reqLock.count !== 1) {
          throw new ApiError(409, 'ALREADY_ASSIGNED', 'Этот заказ уже принят другим курьером');
        }
      }

      const deliveryLock = await tx.delivery.updateMany({
        where: {
          id: offer.deliveryId,
          assignedCourierId: null,
          status: { in: ['OFFERED', 'SEARCHING'] },
        },
        data: {
          assignedCourierId: params.courierId,
          status: 'COURIER_ACCEPTED',
          assignedAt: now,
          acceptedAt: now,
        },
      });
      if (deliveryLock.count !== 1) {
        throw new ApiError(409, 'ALREADY_ASSIGNED', 'Этот заказ уже принят другим курьером');
      }

      await tx.courierAssignment.create({
        data: {
          deliveryId: offer.deliveryId,
          orderId: offer.delivery.orderId,
          restaurantId: offer.delivery.restaurantId,
          courierId: params.courierId,
          mode: offer.mode,
          isActive: true,
          assignedAt: now,
          acceptedAt: now,
        },
      });

      await tx.deliveryOffer.update({
        where: { id: offer.id },
        data: { status: 'ACCEPTED', respondedAt: now },
      });

      const competingOffers = await tx.deliveryOffer.findMany({
        where: { deliveryId: offer.deliveryId, id: { not: offer.id }, status: 'PENDING' },
        select: { id: true, courierId: true },
      });

      if (competingOffers.length > 0) {
        await tx.deliveryOffer.updateMany({
          where: { id: { in: competingOffers.map(o => o.id) } },
          data: { status: 'CANCELLED', respondedAt: now },
        });
      }

      if (offer.mode === 'OWN_COURIER') {
        await tx.restaurantCourierAffiliation.updateMany({
          where: { restaurantId: offer.delivery.restaurantId, courierId: params.courierId },
          data: { activeLoad: { increment: 1 } },
        });
      }

      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: offer.deliveryId,
          orderId: offer.delivery.orderId,
          actorId: params.courierId,
          actorRole: 'COURIER',
          fromStatus: offer.delivery.status,
          toStatus: 'COURIER_ACCEPTED',
          note: `Курьер ${offer.courier.name} принял доставку`,
        },
      });

      if (offer.delivery.restaurant.ownerId) {
        await tx.notification.create({
          data: {
            userId: offer.delivery.restaurant.ownerId,
            type: 'COURIER_ACCEPTED',
            title: 'Курьер найден',
            body: `${offer.courier.name} принял доставку по заказу #${offer.delivery.orderId.slice(-6)}`,
            link: `/orders/${offer.delivery.orderId}`,
            metadata: {
              orderId: offer.delivery.orderId,
              deliveryId: offer.deliveryId,
              courierId: params.courierId,
            },
          },
        });
      }

      return {
        offerId: offer.id,
        deliveryId: offer.deliveryId,
        orderId: offer.delivery.orderId,
        restaurantId: offer.delivery.restaurantId,
        courierName: offer.courier.name,
        competingCourierIds: competingOffers.map(o => o.courierId),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  ioEvent(
    [`restaurant:${result.restaurantId}`, `delivery:${result.deliveryId}`, `order:${result.orderId}`, `courier:${params.courierId}`],
    'delivery:offer_accepted',
    {
      offerId: result.offerId,
      deliveryId: result.deliveryId,
      orderId: result.orderId,
      courierId: params.courierId,
      courierName: result.courierName,
    },
  );
  ioEvent(
    [`restaurant:${result.restaurantId}`, `delivery:${result.deliveryId}`, `order:${result.orderId}`],
    'delivery:courier_assigned',
    {
      deliveryId: result.deliveryId,
      orderId: result.orderId,
      courierId: params.courierId,
      courierName: result.courierName,
    },
  );
  for (const otherId of result.competingCourierIds) {
    ioEvent(`courier:${otherId}`, 'delivery:cancelled', {
      deliveryId: result.deliveryId,
      orderId: result.orderId,
      reason: 'Заказ уже принят другим курьером',
    });
  }

  return emitCustomerAndRestaurantOrderUpdates(result.orderId, 'delivery:courier_assigned');
}

export async function courierRejectOffer(params: { courierId: string; offerId: string; reason?: string }) {
  const result = await db.$transaction(async tx => {
    const offer = await tx.deliveryOffer.findFirst({
      where: { id: params.offerId, courierId: params.courierId },
      include: {
        delivery: { include: { restaurant: { select: { ownerId: true } } } },
        courier: { select: { name: true } },
      },
    });
    assert(offer, 404, 'NOT_FOUND', 'Предложение не найдено');
    assert(offer.status === 'PENDING', 409, 'OFFER_CLOSED', 'Предложение уже обработано');

    const now = new Date();
    await tx.deliveryOffer.update({
      where: { id: offer.id },
      data: {
        status: 'REJECTED',
        respondedAt: now,
        rejectionReason: params.reason?.trim() || null,
      },
    });

    if (offer.mode === 'OWN_COURIER') {
      await tx.delivery.updateMany({
        where: { id: offer.deliveryId, status: 'OFFERED', assignedCourierId: null },
        data: { status: 'FAILED', cancelReason: 'Собственный курьер отклонил предложение' },
      });
      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: offer.deliveryId,
          orderId: offer.delivery.orderId,
          actorId: params.courierId,
          actorRole: 'COURIER',
          fromStatus: offer.delivery.status,
          toStatus: 'FAILED',
          note: `Курьер ${offer.courier.name} отклонил назначение`,
        },
      });
      if (offer.delivery.restaurant.ownerId) {
        await tx.notification.create({
          data: {
            userId: offer.delivery.restaurant.ownerId,
            type: 'COURIER_REJECTED',
            title: 'Курьер отказался от доставки',
            body: `${offer.courier.name} отклонил заказ #${offer.delivery.orderId.slice(-6)}`,
            link: `/orders/${offer.delivery.orderId}`,
            metadata: { orderId: offer.delivery.orderId, deliveryId: offer.deliveryId },
          },
        });
      }
    }

    return {
      offerId: offer.id,
      deliveryId: offer.deliveryId,
      orderId: offer.delivery.orderId,
      restaurantId: offer.delivery.restaurantId,
      mode: offer.mode,
    };
  });

  ioEvent(`restaurant:${result.restaurantId}`, 'delivery:offer_rejected', result);
  return emitCustomerAndRestaurantOrderUpdates(result.orderId, 'delivery:offer_rejected');
}

export async function courierUpdateDeliveryStatus(params: {
  courierId: string;
  deliveryId: string;
  status: 'PICKED_UP' | 'ON_THE_WAY' | 'DELIVERED';
  note?: string;
}) {
  const allowedFrom: Record<'PICKED_UP' | 'ON_THE_WAY' | 'DELIVERED', DeliveryStatus[]> = {
    PICKED_UP: ['COURIER_ACCEPTED', 'READY_FOR_PICKUP'],
    ON_THE_WAY: ['PICKED_UP', 'COURIER_ACCEPTED', 'READY_FOR_PICKUP'],
    DELIVERED: ['ON_THE_WAY', 'PICKED_UP'],
  };

  const result = await db.$transaction(
    async tx => {
      const delivery = await tx.delivery.findFirst({
        where: { id: params.deliveryId, assignedCourierId: params.courierId },
        include: {
          order: { include: { user: { select: { settings: { select: { language: true } } } } } },
          restaurant: { select: { ownerId: true } },
        },
      });
      assert(delivery, 404, 'NOT_FOUND', 'Доставка не найдена или не назначена вам');
      assert(
        allowedFrom[params.status].includes(delivery.status),
        409,
        'INVALID_DELIVERY_TRANSITION',
        `Невозможно перевести доставку из ${delivery.status} в ${params.status}`,
      );

      const now = new Date();
      await tx.delivery.update({
        where: { id: delivery.id },
        data: {
          status: params.status,
          ...(params.status === 'PICKED_UP' ? { pickedUpAt: now } : {}),
          ...(params.status === 'ON_THE_WAY'
            ? { pickedUpAt: delivery.pickedUpAt ?? now, startedAt: now }
            : {}),
          ...(params.status === 'DELIVERED' ? { deliveredAt: now } : {}),
        },
      });

      if (params.status === 'PICKED_UP' || params.status === 'ON_THE_WAY') {
        await tx.courierAssignment.updateMany({
          where: { deliveryId: delivery.id, courierId: params.courierId, isActive: true },
          data: { pickedUpAt: delivery.pickedUpAt ?? now },
        });
      }

      if (params.status === 'DELIVERED') {
        await tx.courierAssignment.updateMany({
          where: { deliveryId: delivery.id, courierId: params.courierId, isActive: true },
          data: { isActive: false, completedAt: now },
        });
        if (delivery.mode === 'OWN_COURIER') {
          await tx.restaurantCourierAffiliation.updateMany({
            where: {
              restaurantId: delivery.restaurantId,
              courierId: params.courierId,
              activeLoad: { gt: 0 },
            },
            data: { activeLoad: { decrement: 1 } },
          });
        }
      }

      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: delivery.id,
          orderId: delivery.orderId,
          actorId: params.courierId,
          actorRole: 'COURIER',
          fromStatus: delivery.status,
          toStatus: params.status,
          note: params.note?.trim() || null,
        },
      });

      let customerNotice = null;
      const targetOrderStatus: OrderStatus | null =
        params.status === 'ON_THE_WAY'
          ? 'DELIVERING'
          : params.status === 'DELIVERED'
            ? 'DELIVERED'
            : null;

      if (targetOrderStatus && delivery.order.status !== targetOrderStatus) {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: { status: targetOrderStatus },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: delivery.orderId,
            actorId: params.courierId,
            actorRole: 'COURIER',
            fromStatus: delivery.order.status,
            toStatus: targetOrderStatus,
            note: params.note?.trim() || null,
          },
        });
        customerNotice = await tx.notification.create({
          data: {
            userId: delivery.order.userId,
            type: 'ORDER_STATUS',
            title: 'Статус заказа обновлён',
            body: `${delivery.order.restaurantName}: ${targetOrderStatus}`,
            link: '/orders',
            metadata: {
              orderId: delivery.orderId,
              restaurantName: delivery.order.restaurantName,
              status: targetOrderStatus,
            },
          },
        });
      }

      if (params.status === 'DELIVERED' && delivery.restaurant.ownerId) {
        await tx.notification.create({
          data: {
            userId: delivery.restaurant.ownerId,
            type: 'DELIVERY_COMPLETED',
            title: 'Доставка завершена',
            body: `Заказ #${delivery.orderId.slice(-6)} доставлен покупателю`,
            link: `/orders/${delivery.orderId}`,
            metadata: { orderId: delivery.orderId, deliveryId: delivery.id },
          },
        });
      }

      return {
        deliveryId: delivery.id,
        orderId: delivery.orderId,
        restaurantId: delivery.restaurantId,
        customerId: delivery.order.userId,
        language: delivery.order.user.settings?.language,
        customerNotice,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  invalidateBusinessCache(result.restaurantId);
  const eventName =
    params.status === 'PICKED_UP'
      ? 'delivery:picked_up'
      : params.status === 'DELIVERED'
        ? 'delivery:completed'
        : 'delivery:status_updated';

  ioEvent(
    [`restaurant:${result.restaurantId}`, `delivery:${result.deliveryId}`, `order:${result.orderId}`],
    eventName,
    { deliveryId: result.deliveryId, orderId: result.orderId, status: params.status },
  );
  if (result.customerNotice) {
    ioEvent(
      `user:${result.customerId}`,
      'notification',
      notificationDto(result.customerNotice, result.language),
    );
  }
  return emitCustomerAndRestaurantOrderUpdates(result.orderId, eventName);
}
