import { Prisma, type OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from '../config/database.js';
import { receiptStorageReady } from '../config/env.js';
import { assert } from '../utils/errors.js';

export const activeStatuses: OrderStatus[] = ['PENDING_ACCEPTANCE', 'ACCEPTED', 'PREPARING', 'DELIVERING'];
export const cartSchema = z
  .object({
    items: z
      .array(z.object({ dishId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(99) }).strict())
      .min(1)
      .max(50),
  })
  .strict()
  .refine(value => new Set(value.items.map(item => item.dishId)).size === value.items.length, {
    message: 'Повторяющиеся блюда недопустимы',
  });

type CartInput = z.infer<typeof cartSchema>;

export async function quoteCart(input: CartInput, tx: Prisma.TransactionClient = db) {
  const dishes = await tx.dish.findMany({
    where: { id: { in: input.items.map(item => item.dishId) }, isArchived: false },
    include: { restaurant: { include: { deliverySettings: true } } },
  });
  assert(dishes.length === input.items.length, 400, 'DISH_UNAVAILABLE', 'Одно из блюд больше недоступно');
  const restaurant = dishes[0]!.restaurant;
  assert(
    dishes.every(dish => dish.restaurantId === restaurant.id),
    400,
    'MIXED_RESTAURANTS',
    'В одном заказе могут быть блюда только одного ресторана',
  );
  assert(restaurant.isOpen && restaurant.acceptingOrders, 409, 'RESTAURANT_CLOSED', 'Ресторан сейчас закрыт');
  if (restaurant.deliverySettings) {
    assert(
      restaurant.deliverySettings.ownCouriersEnabled || restaurant.deliverySettings.onDemandCouriersEnabled,
      409,
      'DELIVERY_UNAVAILABLE',
      'Ресторан временно не принимает заказы на доставку',
    );
  }
  assert(
    dishes.every(dish => dish.isAvailable && !dish.isArchived),
    409,
    'DISH_UNAVAILABLE',
    'Одно из блюд сейчас недоступно',
  );
  const items = input.items.map(item => {
    const dish = dishes.find(dish => dish.id === item.dishId)!;
    return {
      dishId: dish.id,
      dishName: dish.name,
      unitPrice: dish.price,
      quantity: item.quantity,
      imageUrl: dish.imageUrl,
      total: dish.price.mul(item.quantity),
    };
  });
  const subtotal = items.reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0));
  const total = subtotal.add(restaurant.deliveryFee);
  assert(total.lte(1_000_000_000_000), 400, 'ORDER_TOO_LARGE', 'Сумма заказа слишком велика');
  return {
    restaurant: {
      id: restaurant.id,
      ownerId: restaurant.ownerId,
      name: restaurant.name,
      logoUrl: restaurant.logoUrl,
      addressText: restaurant.addressText,
      isOpen: restaurant.isOpen && restaurant.acceptingOrders,
      minOrder: restaurant.minOrder,
      paymentDetails: restaurant.paymentDetails,
      paymentQrUrl: restaurant.paymentQrUrl,
      paymentInstructions: restaurant.paymentInstructions,
      cardPaymentAvailable: Boolean(
        restaurant.paymentDetails && restaurant.paymentQrUrl && receiptStorageReady,
      ),
    },
    items,
    subtotal,
    deliveryFee: restaurant.deliveryFee,
    total,
  };
}

export const orderInclude = {
  items: true,
  restaurant: { select: { id: true, name: true, logoUrl: true, phone: true, telegram: true } },
  payment: { select: { id: true, method: true, status: true, rejectionReason: true, receiptId: true } },
  review: { select: { id: true, rating: true, text: true } },
} as const;
