import bcrypt from 'bcryptjs';
import {
  ExpenseCategory,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';

const photo = (id: number, width = 1200) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;

const DEMO_RESTAURANT_IDS = [
  'rest-osh',
  'rest-basilico',
  'rest-burger',
  'rest-non',
  'rest-mori',
  'rest-saffron',
];

const DISH_COST_PRICES: Record<string, number> = {
  'dish-plov': 18500,
  'dish-samsa': 9500,
  'dish-achichuk': 19500, // intentionally negative margin for Osh & Olov audit
  'dish-pasta': 19000,
  'dish-pizza': 24000,
  'dish-salad': 11000,
  'dish-burger': 19500,
  'dish-fries': 5500,
  'dish-double': 29000,
  'dish-breakfast': 13000,
  'dish-croissant': 7000,
  'dish-coffee': 6500,
  'dish-noodles': 16000,
  'dish-roll': 28000,
  'dish-rice': 11500,
  'dish-curry': 20000,
  'dish-biryani': 18500,
  'dish-tea': 4500,
};

function daysAgo(now: Date, days: number, hour = 13): Date {
  const d = new Date(now.getTime() - days * 86_400_000);
  d.setUTCHours(hour, 15, 0, 0);
  return d;
}

function inCurrentMonth(now: Date, monthStart: Date, preferredDaysAgo: number, hour = 11): Date {
  const candidate = daysAgo(now, preferredDaysAgo, hour);
  if (candidate >= monthStart && candidate <= now) return candidate;
  return new Date(Math.min(now.getTime() - 3600_000, monthStart.getTime() + 12 * 3600_000));
}

interface OrderComboItem {
  dishId: string;
  dishName: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string;
}

interface DemoDeliveryPoint {
  latitude: number;
  longitude: number;
  addressText: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
}

const DEMO_DELIVERY_POINTS: DemoDeliveryPoint[] = [
  // Chilonzor (high density)
  { latitude: 41.278, longitude: 69.212, addressText: 'Ташкент, Чиланзарский район, кв-л 5, д. 14', label: 'Дом', recipientName: 'Азиз Каримов', recipientPhone: '+998901110101' },
  { latitude: 41.272, longitude: 69.203, addressText: 'Ташкент, Чиланзарский район, ул. Бунёдкор, 42', label: 'Офис', recipientName: 'Сардор Рахимов', recipientPhone: '+998901110102' },
  { latitude: 41.281, longitude: 69.222, addressText: 'Ташкент, Чиланзарский район, ул. Катартал, 19', label: 'Дом', recipientName: 'Малика Тураева', recipientPhone: '+998901110103' },
  { latitude: 41.268, longitude: 69.195, addressText: 'Ташкент, Чиланзарский район, кв-л 12, д. 7', label: 'Квартира', recipientName: 'Дильшод Усманов', recipientPhone: '+998901110104' },
  { latitude: 41.275, longitude: 69.216, addressText: 'Ташкент, Чиланзарский район, м. Новза, 5', label: 'Офис', recipientName: 'Нодира Алимова', recipientPhone: '+998901110105' },
  // Yunusobod (high density)
  { latitude: 41.352, longitude: 69.288, addressText: 'Ташкент, Юнусабадский район, кв-л 4, д. 22', label: 'Дом', recipientName: 'Жасур Махмудов', recipientPhone: '+998901110201' },
  { latitude: 41.362, longitude: 69.295, addressText: 'Ташкент, Юнусабадский район, ул. Амира Темура, 108', label: 'Офис', recipientName: 'Камола Ибрагимова', recipientPhone: '+998901110202' },
  { latitude: 41.344, longitude: 69.284, addressText: 'Ташкент, Юнусабадский район, кв-л 11, д. 9', label: 'Дом', recipientName: 'Бобур Саидов', recipientPhone: '+998901110203' },
  { latitude: 41.356, longitude: 69.302, addressText: 'Ташкент, Юнусабадский район, ул. Ахмад Дониш, 18', label: 'Офис', recipientName: 'Зилола Хакимова', recipientPhone: '+998901110204' },
  // Mirzo Ulug'bek
  { latitude: 41.333, longitude: 69.342, addressText: 'Ташкент, Мирзо-Улугбекский район, м-в Буз-1, д. 11', label: 'Дом', recipientName: 'Шерзод Назаров', recipientPhone: '+998901110301' },
  { latitude: 41.341, longitude: 69.365, addressText: 'Ташкент, Мирзо-Улугбекский район, ул. Буюк Ипак Йули, 154', label: 'Офис', recipientName: 'Севара Ахмедова', recipientPhone: '+998901110302' },
  { latitude: 41.326, longitude: 69.335, addressText: 'Ташкент, Мирзо-Улугбекский район, ул. Мирзо Улугбека, 62', label: 'Дом', recipientName: 'Отабек Юлдашев', recipientPhone: '+998901110303' },
  // Yakkasaroy
  { latitude: 41.284, longitude: 69.261, addressText: 'Ташкент, Яккасарайский район, ул. Шота Руставели, 55', label: 'Офис', recipientName: 'Тимур Азизов', recipientPhone: '+998901234500' },
  { latitude: 41.277, longitude: 69.268, addressText: 'Ташкент, Яккасарайский район, ул. Бобур, 34', label: 'Дом', recipientName: 'Лейла Мирзаева', recipientPhone: '+998901110402' },
  // Mirobod
  { latitude: 41.297, longitude: 69.286, addressText: 'Ташкент, Мирабадский район, ул. Ойбек, 24', label: 'Офис', recipientName: 'Фаррух Абдуллаев', recipientPhone: '+998901110501' },
  { latitude: 41.292, longitude: 69.295, addressText: 'Ташкент, Мирабадский район, ул. Нукус, 73', label: 'Дом', recipientName: 'Мадина Курбанова', recipientPhone: '+998901110502' },
  // Shayxontohur
  { latitude: 41.318, longitude: 69.238, addressText: 'Ташкент, Шайхантахурский район, ул. Навои, 29', label: 'Офис', recipientName: 'Санжар Исмоилов', recipientPhone: '+998901110601' },
  // Uchtepa (medium-far)
  { latitude: 41.293, longitude: 69.176, addressText: 'Ташкент, Учтепинский район, кв-л 23, д. 16', label: 'Дом', recipientName: 'Умид Собиров', recipientPhone: '+998901110701' },
  // Sergeli (far south, higher delivery cost / underserved)
  { latitude: 41.224, longitude: 69.233, addressText: 'Ташкент, Сергелийский район, м-в Сергели-7, д. 30', label: 'Дом', recipientName: 'Достон Эргашев', recipientPhone: '+998901110801' },
  { latitude: 41.218, longitude: 69.222, addressText: 'Ташкент, Сергелийский район, ул. Янги Сергели, 45', label: 'Офис', recipientName: 'Гульноза Тошматова', recipientPhone: '+998901110802' },
  // Olmazor
  { latitude: 41.351, longitude: 69.218, addressText: 'Ташкент, Алмазарский район, ул. Беруни, 88', label: 'Дом', recipientName: 'Ильхом Ходжаев', recipientPhone: '+998901110901' },
  // Yashnobod
  { latitude: 41.288, longitude: 69.348, addressText: 'Ташкент, Яшнабадский район, ул. Паркент, 112', label: 'Дом', recipientName: 'Рустам Норматов', recipientPhone: '+998901111001' },
  // Yangihayot (far)
  { latitude: 41.202, longitude: 69.191, addressText: 'Ташкент, Янгихаётский район, м-в Спутник-4, д. 8', label: 'Дом', recipientName: 'Абдулло Хасанов', recipientPhone: '+998901111101' },
  // Bektemir (far)
  { latitude: 41.221, longitude: 69.341, addressText: 'Ташкент, Бектемирский район, ул. Хусайна Бойкаро, 19', label: 'Дом', recipientName: 'Эльдор Жумаев', recipientPhone: '+998901111201' },
];

async function seedOrdersBatch(
  prisma: PrismaClient,
  params: {
    prefix: string;
    restaurantId: string;
    restaurantName: string;
    restaurantAddress: string;
    deliveryFee: number;
    customerId: string;
    customerName: string;
    customerPhone: string;
    addressSnapshot: { latitude: number; longitude: number; addressText: string; label: string };
    now: Date;
    totalCount: number;
    currentCount: number;
    cancelEvery: number;
    unpaidIndices: number[];
    combos: OrderComboItem[][];
  },
) {
  const orderHours = [12, 13, 13, 14, 18, 19, 19, 20, 21, 11];
  const unpaidSet = new Set(params.unpaidIndices);
  const ops: Array<Promise<unknown>> = [];
  const restSeedOffset = params.restaurantId.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);

  for (let i = 0; i < params.totalCount; i++) {
    const isCurrentWindow = i < params.currentCount;
    const dayOffset = isCurrentWindow
      ? Math.floor((i / params.currentCount) * 28)
      : 30 + Math.floor(((i - params.currentCount) / Math.max(1, params.totalCount - params.currentCount)) * 22);
    const createdAt = daysAgo(params.now, dayOffset, orderHours[i % orderHours.length]!);
    const isCancelled = params.cancelEvery > 0 && (isCurrentWindow ? i % params.cancelEvery === params.cancelEvery - 1 : i % 10 === 9);
    const isUnpaidCard = isCurrentWindow && !isCancelled && unpaidSet.has(i);
    const method: PaymentMethod = isUnpaidCard || i % 2 === 0 ? PaymentMethod.CARD : PaymentMethod.CASH;
    const status = isCancelled ? OrderStatus.CANCELLED : OrderStatus.DELIVERED;
    const paymentStatus: PaymentStatus = isCancelled
      ? PaymentStatus.REJECTED
      : isUnpaidCard
        ? PaymentStatus.AWAITING_CONFIRMATION
        : PaymentStatus.PAID;

    const point = DEMO_DELIVERY_POINTS[(i * 3 + restSeedOffset) % DEMO_DELIVERY_POINTS.length]!;
    const orderAddress = {
      latitude: point.latitude,
      longitude: point.longitude,
      addressText: point.addressText,
      label: point.label,
    };

    const combo = params.combos[i % params.combos.length]!;
    const subtotal = combo.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const total = subtotal + params.deliveryFee;

    ops.push(
      prisma.order.create({
        data: {
          id: `${params.prefix}-${i + 1}`,
          userId: params.customerId,
          restaurantId: params.restaurantId,
          restaurantName: params.restaurantName,
          restaurantAddress: params.restaurantAddress,
          addressSnapshot: orderAddress,
          recipientName: point.recipientName,
          recipientPhone: point.recipientPhone,
          subtotal,
          deliveryFee: params.deliveryFee,
          total,
          status,
          createdAt,
          updatedAt: createdAt,
          items: { create: combo },
          payment: {
            create: {
              method,
              status: paymentStatus,
              rejectionReason: isCancelled ? 'Клиент отменил заказ' : null,
              createdAt,
              updatedAt: createdAt,
            },
          },
        },
      }),
    );

    if (ops.length >= 25) {
      await Promise.all(ops);
      ops.length = 0;
    }
  }
  if (ops.length > 0) await Promise.all(ops);
}

export async function seedBusinessAnalyticsForRestaurants(prisma: PrismaClient, now = new Date()) {
  const passwordHash = await bcrypt.hash('UzBiteBusiness2026!', 12);
  const owner = await prisma.user.upsert({
    where: { id: 'user-owner-osh' },
    create: {
      id: 'user-owner-osh',
      email: 'owner@uzbite.uz',
      username: 'osh_owner',
      name: 'Osh & Olov Business',
      passwordHash,
      role: 'RESTAURANT',
      settings: { create: { language: 'ru', theme: 'light' } },
    },
    update: {
      email: 'owner@uzbite.uz',
      username: 'osh_owner',
      name: 'Osh & Olov Business',
      passwordHash,
      role: 'RESTAURANT',
    },
  });

  const oshExists = await prisma.restaurant.findUnique({ where: { id: 'rest-osh' }, select: { id: true } });
  if (oshExists) {
    await prisma.restaurant.update({ where: { id: 'rest-osh' }, data: { ownerId: owner.id } });
  }

  for (const [dishId, costPrice] of Object.entries(DISH_COST_PRICES)) {
    await prisma.dish.updateMany({ where: { id: dishId }, data: { costPrice } });
  }

  const customerHash = await bcrypt.hash('AnalyticsBuyer2026!', 12);
  const customer = await prisma.user.upsert({
    where: { id: 'user-analytics-customer' },
    create: {
      id: 'user-analytics-customer',
      email: 'analytics.customer@uzbite.uz',
      username: 'analytics_buyer',
      name: 'Тимур Азизов',
      phone: '+998901234500',
      passwordHash: customerHash,
      role: 'USER',
    },
    update: {
      email: 'analytics.customer@uzbite.uz',
      name: 'Тимур Азизов',
      role: 'USER',
    },
  });

  const customerAddress = await prisma.userAddress.upsert({
    where: { id: 'addr-analytics-demo' },
    create: {
      id: 'addr-analytics-demo',
      userId: customer.id,
      latitude: 41.315,
      longitude: 69.285,
      addressText: 'Ташкент, пр-т Мустакиллик, 45',
      label: 'Офис',
      isDefault: true,
    },
    update: {
      addressText: 'Ташкент, пр-т Мустакиллик, 45',
    },
  });

  const addressSnapshot = {
    latitude: customerAddress.latitude,
    longitude: customerAddress.longitude,
    addressText: customerAddress.addressText,
    label: customerAddress.label,
  };

  // Clean up previous analytics seed orders & demo restaurants' expenses/budgets/suppliers
  await prisma.payment.deleteMany({ where: { orderId: { startsWith: 'seed-order-' } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { startsWith: 'seed-order-' } } });
  await prisma.order.deleteMany({ where: { id: { startsWith: 'seed-order-' } } });
  await prisma.expense.deleteMany({ where: { restaurantId: { in: DEMO_RESTAURANT_IDS } } });
  await prisma.expenseBudget.deleteMany({ where: { restaurantId: { in: DEMO_RESTAURANT_IDS } } });
  await prisma.supplier.deleteMany({ where: { restaurantId: { in: DEMO_RESTAURANT_IDS } } });

  // 1. Osh & Olov (rest-osh) — 80 orders
  await seedOrdersBatch(prisma, {
    prefix: 'seed-order-osh',
    restaurantId: 'rest-osh',
    restaurantName: 'Osh & Olov',
    restaurantAddress: 'Ташкент, улица Амира Темура, 12',
    deliveryFee: 12000,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone ?? '+998901234500',
    addressSnapshot,
    now,
    totalCount: 80,
    currentCount: 50,
    cancelEvery: 6,
    unpaidIndices: [4, 14],
    combos: [
      [
        { dishId: 'dish-plov', dishName: 'Чайханский плов', unitPrice: 42000, quantity: 3, imageUrl: photo(1624487) },
        { dishId: 'dish-samsa', dishName: 'Самса с говядиной', unitPrice: 26000, quantity: 4, imageUrl: photo(2474658) },
        { dishId: 'dish-achichuk', dishName: 'Ачичук', unitPrice: 18000, quantity: 2, imageUrl: photo(1640777) },
      ],
      [
        { dishId: 'dish-plov', dishName: 'Чайханский плов', unitPrice: 42000, quantity: 4, imageUrl: photo(1624487) },
        { dishId: 'dish-samsa', dishName: 'Самса с говядиной', unitPrice: 26000, quantity: 2, imageUrl: photo(2474658) },
      ],
      [
        { dishId: 'dish-plov', dishName: 'Чайханский плов', unitPrice: 42000, quantity: 2, imageUrl: photo(1624487) },
        { dishId: 'dish-samsa', dishName: 'Самса с говядиной', unitPrice: 26000, quantity: 3, imageUrl: photo(2474658) },
        { dishId: 'dish-achichuk', dishName: 'Ачичук', unitPrice: 18000, quantity: 2, imageUrl: photo(1640777) },
      ],
    ],
  });

  // 2. Basilico (rest-basilico) — 46 orders
  await seedOrdersBatch(prisma, {
    prefix: 'seed-order-bas',
    restaurantId: 'rest-basilico',
    restaurantName: 'Basilico',
    restaurantAddress: 'Ташкент, улица Шота Руставели, 24',
    deliveryFee: 10000,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone ?? '+998901234500',
    addressSnapshot,
    now,
    totalCount: 46,
    currentCount: 30,
    cancelEvery: 15,
    unpaidIndices: [],
    combos: [
      [
        { dishId: 'dish-pizza', dishName: 'Пицца Маргарита', unitPrice: 68000, quantity: 2, imageUrl: photo(825661) },
        { dishId: 'dish-pasta', dishName: 'Паста помодоро', unitPrice: 58000, quantity: 2, imageUrl: photo(1279330) },
      ],
      [
        { dishId: 'dish-pasta', dishName: 'Паста помодоро', unitPrice: 58000, quantity: 3, imageUrl: photo(1279330) },
        { dishId: 'dish-salad', dishName: 'Зелёный салат', unitPrice: 32000, quantity: 2, imageUrl: photo(1640777) },
      ],
    ],
  });

  // 3. Burger Bureau (rest-burger) — 40 orders
  await seedOrdersBatch(prisma, {
    prefix: 'seed-order-bur',
    restaurantId: 'rest-burger',
    restaurantName: 'Burger Bureau',
    restaurantAddress: 'Ташкент, улица Шахрисабз, 8',
    deliveryFee: 9000,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone ?? '+998901234500',
    addressSnapshot,
    now,
    totalCount: 40,
    currentCount: 26,
    cancelEvery: 5,
    unpaidIndices: [3],
    combos: [
      [
        { dishId: 'dish-burger', dishName: 'Бюро бургер', unitPrice: 49000, quantity: 3, imageUrl: photo(70497) },
        { dishId: 'dish-fries', dishName: 'Картофель фри', unitPrice: 19000, quantity: 3, imageUrl: photo(1583884) },
      ],
      [
        { dishId: 'dish-double', dishName: 'Двойной чизбургер', unitPrice: 69000, quantity: 2, imageUrl: photo(1639557) },
        { dishId: 'dish-fries', dishName: 'Картофель фри', unitPrice: 19000, quantity: 2, imageUrl: photo(1583884) },
      ],
    ],
  });

  // 4. Non House (rest-non) — 36 orders
  await seedOrdersBatch(prisma, {
    prefix: 'seed-order-non',
    restaurantId: 'rest-non',
    restaurantName: 'Non House',
    restaurantAddress: 'Ташкент, улица Нукус, 16',
    deliveryFee: 10000,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone ?? '+998901234500',
    addressSnapshot,
    now,
    totalCount: 36,
    currentCount: 24,
    cancelEvery: 12,
    unpaidIndices: [],
    combos: [
      [
        { dishId: 'dish-breakfast', dishName: 'Доброе утро', unitPrice: 39000, quantity: 2, imageUrl: photo(376464) },
        { dishId: 'dish-coffee', dishName: 'Капучино', unitPrice: 24000, quantity: 3, imageUrl: photo(302899) },
      ],
      [
        { dishId: 'dish-croissant', dishName: 'Круассан', unitPrice: 22000, quantity: 4, imageUrl: photo(2135) },
        { dishId: 'dish-coffee', dishName: 'Капучино', unitPrice: 24000, quantity: 2, imageUrl: photo(302899) },
      ],
    ],
  });

  // 5. Mori (rest-mori) — 38 orders
  await seedOrdersBatch(prisma, {
    prefix: 'seed-order-mori',
    restaurantId: 'rest-mori',
    restaurantName: 'Mori',
    restaurantAddress: 'Ташкент, улица Садыка Азимова, 20',
    deliveryFee: 12000,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone ?? '+998901234500',
    addressSnapshot,
    now,
    totalCount: 38,
    currentCount: 24,
    cancelEvery: 12,
    unpaidIndices: [2, 9],
    combos: [
      [
        { dishId: 'dish-roll', dishName: 'Ролл с лососем', unitPrice: 64000, quantity: 2, imageUrl: photo(357756) },
        { dishId: 'dish-noodles', dishName: 'Лапша с овощами', unitPrice: 46000, quantity: 2, imageUrl: photo(2347311) },
      ],
      [
        { dishId: 'dish-rice', dishName: 'Рис с овощами', unitPrice: 35000, quantity: 3, imageUrl: photo(723198) },
        { dishId: 'dish-roll', dishName: 'Ролл с лососем', unitPrice: 64000, quantity: 2, imageUrl: photo(357756) },
      ],
    ],
  });

  // 6. Saffron (rest-saffron) — 30 orders
  await seedOrdersBatch(prisma, {
    prefix: 'seed-order-saf',
    restaurantId: 'rest-saffron',
    restaurantName: 'Saffron',
    restaurantAddress: 'Ташкент, улица Махтумкули, 30',
    deliveryFee: 12000,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone ?? '+998901234500',
    addressSnapshot,
    now,
    totalCount: 30,
    currentCount: 20,
    cancelEvery: 10,
    unpaidIndices: [],
    combos: [
      [
        { dishId: 'dish-curry', dishName: 'Курица карри', unitPrice: 52000, quantity: 2, imageUrl: photo(2474661) },
        { dishId: 'dish-biryani', dishName: 'Бирьяни', unitPrice: 48000, quantity: 2, imageUrl: photo(1624487) },
        { dishId: 'dish-tea', dishName: 'Чай с пряностями', unitPrice: 18000, quantity: 2, imageUrl: photo(1417945) },
      ],
    ],
  });

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Seed suppliers, expenses, and budgets for rest-osh
  const supMeatCheap = await prisma.supplier.create({
    data: { id: 'seed-sup-meat-1', restaurantId: 'rest-osh', name: 'Chorvoq Go\'sht База', taxId: '301445912', phone: '+998909001122', category: ExpenseCategory.INGREDIENTS },
  });
  const supMeatExpensive = await prisma.supplier.create({
    data: { id: 'seed-sup-meat-2', restaurantId: 'rest-osh', name: 'Toshkent Agro Meat', taxId: '304882190', phone: '+998909003344', category: ExpenseCategory.INGREDIENTS },
  });
  const supRice = await prisma.supplier.create({
    data: { id: 'seed-sup-rice', restaurantId: 'rest-osh', name: 'Xorazm Guruch Invest', taxId: '308112233', phone: '+998909005566', category: ExpenseCategory.INGREDIENTS },
  });
  const supUtil = await prisma.supplier.create({
    data: { id: 'seed-sup-util', restaurantId: 'rest-osh', name: 'Toshkent Elektr & Kommunal', taxId: '200112299', phone: '+998712000100', category: ExpenseCategory.UTILITIES },
  });
  const supTelecom = await prisma.supplier.create({
    data: { id: 'seed-sup-telecom', restaurantId: 'rest-osh', name: 'Uztelecom Business', taxId: '200998877', phone: '+998712000200', category: ExpenseCategory.COMMUNICATION },
  });
  const supRent = await prisma.supplier.create({
    data: { id: 'seed-sup-rent', restaurantId: 'rest-osh', name: 'Amir Temur Plaza LLC', taxId: '309554411', phone: '+998712000300', category: ExpenseCategory.RENT },
  });
  const supPack = await prisma.supplier.create({
    data: { id: 'seed-sup-pack', restaurantId: 'rest-osh', name: 'EcoPack Tashkent', taxId: '307665544', phone: '+998909007788', category: ExpenseCategory.PACKAGING },
  });

  await prisma.expense.createMany({
    data: [
      {
        id: 'seed-exp-dup-1', restaurantId: 'rest-osh', supplierId: supMeatCheap.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Говядина мякоть',
        description: 'Закуп говядины мякоть для плова (50 кг)', amount: 4100000,
        quantity: 50, unit: 'кг', unitPrice: 82000, invoiceNumber: 'INV-2026-1104',
        spentAt: daysAgo(now, 8, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-dup-2', restaurantId: 'rest-osh', supplierId: supMeatCheap.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Говядина мякоть',
        description: 'Повторное списание накладной INV-2026-1104 (говядина 50 кг)', amount: 4100000,
        quantity: 50, unit: 'кг', unitPrice: 82000, invoiceNumber: 'INV-2026-1104',
        spentAt: daysAgo(now, 7, 15), source: 'CSV', isVerified: false,
      },
      {
        id: 'seed-exp-meat-exp', restaurantId: 'rest-osh', supplierId: supMeatExpensive.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Говядина мякоть',
        description: 'Срочный закуп говядины у альтернативного поставщика (60 кг)', amount: 5760000,
        quantity: 60, unit: 'кг', unitPrice: 96000, invoiceNumber: 'TAM-882',
        spentAt: daysAgo(now, 4, 11), source: 'MANUAL', isVerified: false,
      },
      {
        id: 'seed-exp-rice-1', restaurantId: 'rest-osh', supplierId: supRice.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Рис Лазер',
        description: 'Рис Лазер отборный, партия 1', amount: 1760000,
        quantity: 80, unit: 'кг', unitPrice: 22000, invoiceNumber: 'XGI-901',
        spentAt: daysAgo(now, 45, 9), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-rice-2', restaurantId: 'rest-osh', supplierId: supRice.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Рис Лазер',
        description: 'Рис Лазер отборный, партия 2', amount: 1760000,
        quantity: 80, unit: 'кг', unitPrice: 22000, invoiceNumber: 'XGI-934',
        spentAt: daysAgo(now, 34, 9), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-rice-3', restaurantId: 'rest-osh', supplierId: supRice.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Рис Лазер',
        description: 'Рис Лазер отборный, партия 3', amount: 1760000,
        quantity: 80, unit: 'кг', unitPrice: 22000, invoiceNumber: 'XGI-968',
        spentAt: daysAgo(now, 22, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-rice-spike-mismatch', restaurantId: 'rest-osh', supplierId: supRice.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Рис Лазер',
        description: 'Рис Лазер высший сорт (ошибка в сумме 100×28000=2.8M, проведено 3.4M)', amount: 3400000,
        quantity: 100, unit: 'кг', unitPrice: 28000, invoiceNumber: 'INV-2026-1109',
        spentAt: daysAgo(now, 3, 12), source: 'MANUAL', isVerified: false,
      },
      {
        id: 'seed-exp-util-1', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия и вода',
        description: 'Оплата электроэнергии (неделя 1)', amount: 880000,
        invoiceNumber: 'UTIL-101', spentAt: daysAgo(now, 52, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-util-2', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия и вода',
        description: 'Оплата электроэнергии (неделя 2)', amount: 910000,
        invoiceNumber: 'UTIL-102', spentAt: daysAgo(now, 45, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-util-3', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия и вода',
        description: 'Оплата электроэнергии (неделя 3)', amount: 890000,
        invoiceNumber: 'UTIL-103', spentAt: daysAgo(now, 38, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-util-4', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия и газ',
        description: 'Оплата газа и водоснабжения (неделя 4)', amount: 940000,
        invoiceNumber: 'UTIL-104', spentAt: daysAgo(now, 24, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-util-5', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия и газ',
        description: 'Оплата электроэнергии (неделя 5)', amount: 920000,
        invoiceNumber: 'UTIL-105', spentAt: daysAgo(now, 18, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-util-6', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия и газ',
        description: 'Коммунальные услуги кухни', amount: 960000,
        invoiceNumber: 'UTIL-106', spentAt: inCurrentMonth(now, monthStart, 10, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-util-7', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия',
        description: 'Доплата за свет и вентиляцию', amount: 900000,
        invoiceNumber: 'UTIL-107', spentAt: inCurrentMonth(now, monthStart, 6, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-util-outlier', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия РЭС',
        description: 'Аномальное списание электроэнергии за ночное оборудование / утечка счётчика', amount: 9800000,
        invoiceNumber: 'UTIL-2026-ERR', spentAt: inCurrentMonth(now, monthStart, 2, 14), source: 'MANUAL', isVerified: false,
      },
      {
        id: 'seed-exp-cat-mismatch', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.MARKETING, itemName: 'Счёт РЭС за электроэнергию',
        description: 'Оплата электроэнергии РЭС и трансформатора (ошибочно отнесено в Маркетинг)', amount: 1450000,
        invoiceNumber: 'RES-4402', spentAt: daysAgo(now, 5, 16), source: 'CSV', isVerified: false,
      },
      {
        id: 'seed-exp-future', restaurantId: 'rest-osh', supplierId: supPack.id,
        category: ExpenseCategory.PACKAGING, itemName: 'Ланч-боксы крафт',
        description: 'Упаковка и контейнеры (ошибка в дате документа — будущий месяц)', amount: 650000,
        quantity: 1000, unit: 'шт', unitPrice: 650, invoiceNumber: 'PACK-FUT-01',
        spentAt: new Date(now.getTime() + 7 * 86_400_000), source: 'MANUAL', isVerified: false,
      },
      {
        id: 'seed-exp-rent-prev', restaurantId: 'rest-osh', supplierId: supRent.id,
        category: ExpenseCategory.RENT, itemName: 'Аренда помещения',
        description: 'Аренда кухонного зала (прошлый месяц)', amount: 2200000,
        quantity: 1, unit: 'мес', unitPrice: 2200000, invoiceNumber: 'RENT-10',
        spentAt: daysAgo(now, 35, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-rent-curr', restaurantId: 'rest-osh', supplierId: supRent.id,
        category: ExpenseCategory.RENT, itemName: 'Аренда помещения',
        description: 'Аренда кухонного зала + доп. склад', amount: 2950000,
        quantity: 1, unit: 'мес', unitPrice: 2950000, invoiceNumber: 'RENT-11',
        spentAt: inCurrentMonth(now, monthStart, 12, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-comm-prev', restaurantId: 'rest-osh', supplierId: supTelecom.id,
        category: ExpenseCategory.COMMUNICATION, itemName: 'Интернет и телефония',
        description: 'Корпоративная связь и интернет (прошлый месяц)', amount: 320000,
        quantity: 1, unit: 'мес', unitPrice: 320000, invoiceNumber: 'UZT-10',
        spentAt: daysAgo(now, 36, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-comm-curr', restaurantId: 'rest-osh', supplierId: supTelecom.id,
        category: ExpenseCategory.COMMUNICATION, itemName: 'Интернет, IP-телефония и роуминг',
        description: 'Связь и дополнительные SMS-пакеты', amount: 780000,
        quantity: 1, unit: 'мес', unitPrice: 780000, invoiceNumber: 'UZT-11',
        spentAt: inCurrentMonth(now, monthStart, 9, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-salary-prev', restaurantId: 'rest-osh', supplierId: null,
        category: ExpenseCategory.SALARY, itemName: 'ФОТ персонала кухни',
        description: 'Зарплата поваров и сборщиков (прошлый месяц)', amount: 2400000,
        invoiceNumber: 'PAY-10', spentAt: daysAgo(now, 33, 17), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-salary-curr', restaurantId: 'rest-osh', supplierId: null,
        category: ExpenseCategory.SALARY, itemName: 'ФОТ персонала кухни и сверхурочные',
        description: 'Зарплата поваров + ночные смены', amount: 3450000,
        invoiceNumber: 'PAY-11', spentAt: inCurrentMonth(now, monthStart, 5, 17), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-pack-curr', restaurantId: 'rest-osh', supplierId: supPack.id,
        category: ExpenseCategory.PACKAGING, itemName: 'Термопакеты и приборы',
        description: 'Упаковка для доставки', amount: 540000,
        quantity: 900, unit: 'шт', unitPrice: 600, invoiceNumber: 'PACK-112',
        spentAt: inCurrentMonth(now, monthStart, 11, 12), source: 'MANUAL', isVerified: true,
      },
    ],
  });

  await prisma.expenseBudget.createMany({
    data: [
      { id: 'seed-budget-util', restaurantId: 'rest-osh', category: ExpenseCategory.UTILITIES, month: monthStart, limit: 3500000 },
      { id: 'seed-budget-ing', restaurantId: 'rest-osh', category: ExpenseCategory.INGREDIENTS, month: monthStart, limit: 15000000 },
      { id: 'seed-budget-rent', restaurantId: 'rest-osh', category: ExpenseCategory.RENT, month: monthStart, limit: 3200000 },
      { id: 'seed-budget-sal', restaurantId: 'rest-osh', category: ExpenseCategory.SALARY, month: monthStart, limit: 4500000 },
      { id: 'seed-budget-comm', restaurantId: 'rest-osh', category: ExpenseCategory.COMMUNICATION, month: monthStart, limit: 600000 },
      { id: 'seed-budget-pack', restaurantId: 'rest-osh', category: ExpenseCategory.PACKAGING, month: monthStart, limit: 1000000 },
    ],
  });

  // Seed other 5 restaurants with realistic suppliers, expenses, and tailored anomalies
  const basDairy = await prisma.supplier.create({
    data: { id: 'seed-sup-bas-dairy', restaurantId: 'rest-basilico', name: 'Italia Cheese Tashkent', category: ExpenseCategory.INGREDIENTS },
  });
  const basOil = await prisma.supplier.create({
    data: { id: 'seed-sup-bas-oil', restaurantId: 'rest-basilico', name: 'Mediterraneo Import', category: ExpenseCategory.INGREDIENTS },
  });
  const basUtil = await prisma.supplier.create({
    data: { id: 'seed-sup-bas-util', restaurantId: 'rest-basilico', name: 'Toshkent Elektr', category: ExpenseCategory.UTILITIES },
  });
  await prisma.expense.createMany({
    data: [
      { id: 'seed-exp-bas-1', restaurantId: 'rest-basilico', supplierId: basDairy.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Моцарелла для пиццы', description: 'Моцарелла свежая 20 кг', amount: 1900000, quantity: 20, unit: 'кг', unitPrice: 95000, invoiceNumber: 'BAS-DUP-01', spentAt: daysAgo(now, 9), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-bas-2', restaurantId: 'rest-basilico', supplierId: basDairy.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Моцарелла для пиццы', description: 'Повторное списание BAS-DUP-01', amount: 1900000, quantity: 20, unit: 'кг', unitPrice: 95000, invoiceNumber: 'BAS-DUP-01', spentAt: daysAgo(now, 8), source: 'CSV', isVerified: false },
      { id: 'seed-exp-bas-oil-1', restaurantId: 'rest-basilico', supplierId: basOil.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Оливковое масло Extra Virgin', description: 'Партия 1', amount: 900000, quantity: 10, unit: 'л', unitPrice: 90000, invoiceNumber: 'OIL-1', spentAt: daysAgo(now, 45), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-bas-oil-2', restaurantId: 'rest-basilico', supplierId: basOil.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Оливковое масло Extra Virgin', description: 'Партия 2', amount: 900000, quantity: 10, unit: 'л', unitPrice: 90000, invoiceNumber: 'OIL-2', spentAt: daysAgo(now, 32), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-bas-oil-3', restaurantId: 'rest-basilico', supplierId: basOil.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Оливковое масло Extra Virgin', description: 'Партия 3 (рост цены +22%)', amount: 1100000, quantity: 10, unit: 'л', unitPrice: 110000, invoiceNumber: 'OIL-3', spentAt: daysAgo(now, 4), source: 'MANUAL', isVerified: false },
      { id: 'seed-exp-bas-cat', restaurantId: 'rest-basilico', supplierId: basUtil.id, category: ExpenseCategory.DELIVERY, itemName: 'Счёт РЭС за электроэнергию печи', description: 'Оплата электроэнергии итальянской печи (ошибка категории)', amount: 1150000, invoiceNumber: 'BAS-EL-1', spentAt: daysAgo(now, 6), source: 'MANUAL', isVerified: false },
      { id: 'seed-exp-bas-rent', restaurantId: 'rest-basilico', supplierId: null, category: ExpenseCategory.RENT, itemName: 'Аренда зала', description: 'Аренда помещения на ул. Руставели', amount: 2100000, invoiceNumber: 'BAS-R-11', spentAt: inCurrentMonth(now, monthStart, 10), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-bas-mkt', restaurantId: 'rest-basilico', supplierId: null, category: ExpenseCategory.MARKETING, itemName: 'Таргет Instagram', description: 'Осенняя рекламная кампания', amount: 1650000, invoiceNumber: 'BAS-M-11', spentAt: inCurrentMonth(now, monthStart, 5), source: 'MANUAL', isVerified: true },
    ],
  });
  await prisma.expenseBudget.createMany({
    data: [
      { id: 'seed-b-bas-mkt', restaurantId: 'rest-basilico', category: ExpenseCategory.MARKETING, month: monthStart, limit: 1200000 },
      { id: 'seed-b-bas-ing', restaurantId: 'rest-basilico', category: ExpenseCategory.INGREDIENTS, month: monthStart, limit: 6000000 },
    ],
  });

  // Burger Bureau
  const burSup1 = await prisma.supplier.create({ data: { id: 'seed-sup-bur-1', restaurantId: 'rest-burger', name: 'AgroFarm Beef', category: ExpenseCategory.INGREDIENTS } });
  const burSup2 = await prisma.supplier.create({ data: { id: 'seed-sup-bur-2', restaurantId: 'rest-burger', name: 'FreshFry Wholesale', category: ExpenseCategory.INGREDIENTS } });
  await prisma.expense.createMany({
    data: [
      { id: 'seed-exp-bur-1', restaurantId: 'rest-burger', supplierId: burSup1.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Котлеты говяжьи', description: 'Ошибка в сумме 100×32000=3.2M проведено 3.8M', amount: 3800000, quantity: 100, unit: 'шт', unitPrice: 32000, invoiceNumber: 'BUR-101', spentAt: daysAgo(now, 5), source: 'MANUAL', isVerified: false },
      { id: 'seed-exp-bur-2', restaurantId: 'rest-burger', supplierId: burSup1.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Картофель замороженный', description: 'Картофель фри от AgroFarm', amount: 900000, quantity: 50, unit: 'кг', unitPrice: 18000, invoiceNumber: 'BUR-102', spentAt: daysAgo(now, 14), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-bur-3', restaurantId: 'rest-burger', supplierId: burSup2.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Картофель замороженный', description: 'Картофель фри дороже', amount: 1440000, quantity: 60, unit: 'кг', unitPrice: 24000, invoiceNumber: 'BUR-103', spentAt: daysAgo(now, 3), source: 'MANUAL', isVerified: false },
      { id: 'seed-exp-bur-4', restaurantId: 'rest-burger', supplierId: null, category: ExpenseCategory.SALARY, itemName: 'Зарплата смены', description: 'ФОТ поваров и сборщиков', amount: 1850000, invoiceNumber: 'BUR-PAY', spentAt: inCurrentMonth(now, monthStart, 7), source: 'MANUAL', isVerified: true },
    ],
  });

  // Non House
  await prisma.expense.createMany({
    data: [
      { id: 'seed-exp-non-1', restaurantId: 'rest-non', category: ExpenseCategory.SALARY, itemName: 'ФОТ пекарни', description: 'Зарплата пекарей и бариста', amount: 2300000, invoiceNumber: 'NON-PAY', spentAt: inCurrentMonth(now, monthStart, 6), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-non-2', restaurantId: 'rest-non', category: ExpenseCategory.INGREDIENTS, itemName: 'Мука, масло, кофе', description: 'Сырьё для круассанов и капучино', amount: 1450000, invoiceNumber: 'NON-ING', spentAt: daysAgo(now, 4), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-non-3', restaurantId: 'rest-non', category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия пекарни', description: 'Плата за свет (1)', amount: 420000, invoiceNumber: 'NON-U1', spentAt: daysAgo(now, 48), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-non-4', restaurantId: 'rest-non', category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия пекарни', description: 'Плата за свет (2)', amount: 440000, invoiceNumber: 'NON-U2', spentAt: daysAgo(now, 34), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-non-5', restaurantId: 'rest-non', category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия пекарни', description: 'Плата за свет (3)', amount: 430000, invoiceNumber: 'NON-U3', spentAt: daysAgo(now, 18), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-non-6', restaurantId: 'rest-non', category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия пекарни', description: 'Аномальный счёт за свет', amount: 2650000, invoiceNumber: 'NON-U4', spentAt: inCurrentMonth(now, monthStart, 2), source: 'MANUAL', isVerified: false },
    ],
  });

  // Mori
  const moriFish = await prisma.supplier.create({ data: { id: 'seed-sup-mori-fish', restaurantId: 'rest-mori', name: 'Oceanic Fish UZ', category: ExpenseCategory.INGREDIENTS } });
  await prisma.expense.createMany({
    data: [
      { id: 'seed-exp-mori-1', restaurantId: 'rest-mori', supplierId: moriFish.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Лосось охлаждённый', description: 'Партия 1', amount: 2200000, quantity: 10, unit: 'кг', unitPrice: 220000, invoiceNumber: 'MR-1', spentAt: daysAgo(now, 42), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-mori-2', restaurantId: 'rest-mori', supplierId: moriFish.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Лосось охлаждённый', description: 'Партия 2', amount: 2200000, quantity: 10, unit: 'кг', unitPrice: 220000, invoiceNumber: 'MR-2', spentAt: daysAgo(now, 25), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-mori-3', restaurantId: 'rest-mori', supplierId: moriFish.id, category: ExpenseCategory.INGREDIENTS, itemName: 'Лосось охлаждённый', description: 'Партия 3 (+27% скачок цены)', amount: 2800000, quantity: 10, unit: 'кг', unitPrice: 280000, invoiceNumber: 'MR-3', spentAt: daysAgo(now, 3), source: 'MANUAL', isVerified: false },
      { id: 'seed-exp-mori-4', restaurantId: 'rest-mori', supplierId: null, category: ExpenseCategory.PACKAGING, itemName: 'Палочки и соевые боксы', description: 'Упаковка для суши', amount: 480000, invoiceNumber: 'MR-PK', spentAt: inCurrentMonth(now, monthStart, 7), source: 'MANUAL', isVerified: true },
    ],
  });

  // Saffron
  await prisma.expense.createMany({
    data: [
      { id: 'seed-exp-saf-1', restaurantId: 'rest-saffron', category: ExpenseCategory.UTILITIES, itemName: 'Коммунальные услуги', description: 'Прошлый месяц', amount: 680000, invoiceNumber: 'SAF-U1', spentAt: daysAgo(now, 35), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-saf-2', restaurantId: 'rest-saffron', category: ExpenseCategory.UTILITIES, itemName: 'Коммунальные услуги', description: 'Рост тарифов в текущем месяце', amount: 1290000, invoiceNumber: 'SAF-U2', spentAt: inCurrentMonth(now, monthStart, 4), source: 'MANUAL', isVerified: true },
      { id: 'seed-exp-saf-3', restaurantId: 'rest-saffron', category: ExpenseCategory.INGREDIENTS, itemName: 'Специи, рис басмати, курица', description: 'Продуктовый закуп', amount: 2450000, invoiceNumber: 'SAF-ING', spentAt: inCurrentMonth(now, monthStart, 3), source: 'MANUAL', isVerified: true },
    ],
  });
  await prisma.expenseBudget.createMany({
    data: [
      { id: 'seed-b-saf-ing', restaurantId: 'rest-saffron', category: ExpenseCategory.INGREDIENTS, month: monthStart, limit: 2800000 },
      { id: 'seed-b-saf-util', restaurantId: 'rest-saffron', category: ExpenseCategory.UTILITIES, month: monthStart, limit: 1000000 },
      { id: 'seed-b-bur-ing', restaurantId: 'rest-burger', category: ExpenseCategory.INGREDIENTS, month: monthStart, limit: 6500000 },
      { id: 'seed-b-bur-sal', restaurantId: 'rest-burger', category: ExpenseCategory.SALARY, month: monthStart, limit: 2200000 },
      { id: 'seed-b-non-ing', restaurantId: 'rest-non', category: ExpenseCategory.INGREDIENTS, month: monthStart, limit: 2500000 },
      { id: 'seed-b-non-util', restaurantId: 'rest-non', category: ExpenseCategory.UTILITIES, month: monthStart, limit: 1200000 },
      { id: 'seed-b-mori-ing', restaurantId: 'rest-mori', category: ExpenseCategory.INGREDIENTS, month: monthStart, limit: 6200000 },
      { id: 'seed-b-mori-pack', restaurantId: 'rest-mori', category: ExpenseCategory.PACKAGING, month: monthStart, limit: 700000 },
    ],
  });
}
