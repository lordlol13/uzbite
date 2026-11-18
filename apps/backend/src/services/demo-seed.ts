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
  const supOshTax = await prisma.supplier.create({
    data: { id: 'seed-sup-osh-tax', restaurantId: 'rest-osh', name: 'ГНК г. Ташкента (Soliq.uz)', taxId: '200000112', phone: '+998712449800', category: ExpenseCategory.TAXES },
  });
  const supOshGas = await prisma.supplier.create({
    data: { id: 'seed-sup-osh-gas', restaurantId: 'rest-osh', name: 'Худудгаз Тошкент (Hududgaz)', taxId: '200224488', phone: '+998712000404', category: ExpenseCategory.UTILITIES },
  });
  const supOshWater = await prisma.supplier.create({
    data: { id: 'seed-sup-osh-water', restaurantId: 'rest-osh', name: 'Сувсоз (Toshkent Suv Ta\'minoti)', taxId: '200335599', phone: '+998712561095', category: ExpenseCategory.UTILITIES },
  });
  const supOshDel = await prisma.supplier.create({
    data: { id: 'seed-sup-osh-del', restaurantId: 'rest-osh', name: 'Uzum Tezkor & Yandex Delivery', taxId: '310442211', phone: '+998712070011', category: ExpenseCategory.DELIVERY },
  });
  const supOshEqp = await prisma.supplier.create({
    data: { id: 'seed-sup-osh-eqp', restaurantId: 'rest-osh', name: 'ChefTech Service UZ', taxId: '308771122', phone: '+998909552211', category: ExpenseCategory.EQUIPMENT },
  });
  const supOshMkt = await prisma.supplier.create({
    data: { id: 'seed-sup-osh-mkt', restaurantId: 'rest-osh', name: 'Tashkent Digital SMM', taxId: '309112244', phone: '+998909334455', category: ExpenseCategory.MARKETING },
  });
  const supOshOther = await prisma.supplier.create({
    data: { id: 'seed-sup-osh-oth', restaurantId: 'rest-osh', name: 'iiko & Ipak Yo\'li Acquiring', taxId: '201556677', phone: '+998712002233', category: ExpenseCategory.OTHER },
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

      // --- Enriched Osh & Olov: Nov 15 (daysAgo 3) & Last Week Mon-Sun (daysAgo 2..9) ---
      {
        id: 'seed-exp-osh-tax-1115-vat', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'НДС 12% по реализации (ГНК)',
        description: 'Уплата НДС 12% в государственный бюджет по декларации ГНК (счёт-фактура № 11-15)', amount: 1260000,
        quantity: 1, unit: 'дек', unitPrice: 1260000, invoiceNumber: 'OSH-TAX-1115A',
        spentAt: daysAgo(now, 3, 9), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-tax-1115-turn', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'Налог с оборота (ЕНП 4%)',
        description: 'Авансовый платёж по налогу с оборота ЕНП в ГНК за первую половину месяца', amount: 780000,
        quantity: 1, unit: 'платёж', unitPrice: 780000, invoiceNumber: 'OSH-TAX-1115B',
        spentAt: daysAgo(now, 3, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-el-1115-day', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия РЭС (дневной тариф)',
        description: 'Счёт РЭС за дневное потребление электроэнергии кухни и зала (920 кВт·ч)', amount: 828000,
        quantity: 920, unit: 'кВт·ч', unitPrice: 900, invoiceNumber: 'OSH-RES-1115D',
        spentAt: daysAgo(now, 3, 8), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-el-1115-night', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия РЭС (ночной тариф)',
        description: 'Счёт РЭС за ночное потребление электроэнергии и холодильных камер (540 кВт·ч)', amount: 351000,
        quantity: 540, unit: 'кВт·ч', unitPrice: 650, invoiceNumber: 'OSH-RES-1115N',
        spentAt: daysAgo(now, 3, 8), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-gas-1115', restaurantId: 'rest-osh', supplierId: supOshGas.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Природный газ Худудгаз',
        description: 'Оплата природного газа Худудгаз по счётчику для очагов и печей (380 м³)', amount: 570000,
        quantity: 380, unit: 'м³', unitPrice: 1500, invoiceNumber: 'OSH-GAS-1115',
        spentAt: daysAgo(now, 3, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-ing-1115-lamb', restaurantId: 'rest-osh', supplierId: supMeatCheap.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Баранина курдючная и рёбра',
        description: 'Свежая баранина для чайханского плова и самсы (25 кг)', amount: 2300000,
        quantity: 25, unit: 'кг', unitPrice: 92000, invoiceNumber: 'OSH-ING-1115A',
        spentAt: daysAgo(now, 3, 9), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-ing-1115-carrot', restaurantId: 'rest-osh', supplierId: supRice.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Морковь жёлтая для плова',
        description: 'Отобранная жёлтая морковь и овощи для зирвака (80 кг)', amount: 440000,
        quantity: 80, unit: 'кг', unitPrice: 5500, invoiceNumber: 'OSH-ING-1115B',
        spentAt: daysAgo(now, 3, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-sal-1115', restaurantId: 'rest-osh', supplierId: null,
        category: ExpenseCategory.SALARY, itemName: 'Сменный аванс поварам и кассирам (ФОТ)',
        description: 'Зарплата линейных поваров, ошпазов и кассиров за смены 1–15 числа (ФОТ)', amount: 2400000,
        quantity: 8, unit: 'чел', unitPrice: 300000, invoiceNumber: 'OSH-PAY-1115',
        spentAt: daysAgo(now, 3, 15), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-pack-1115', restaurantId: 'rest-osh', supplierId: supPack.id,
        category: ExpenseCategory.PACKAGING, itemName: 'Крафт ланч-боксы с логотипом',
        description: 'Контейнеры и крафт-коробки для порционного плова и самсы', amount: 520000,
        quantity: 800, unit: 'шт', unitPrice: 650, invoiceNumber: 'OSH-PACK-1115',
        spentAt: daysAgo(now, 3, 13), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-del-1115', restaurantId: 'rest-osh', supplierId: supOshDel.id,
        category: ExpenseCategory.DELIVERY, itemName: 'Комиссия агрегатора доставки',
        description: 'Услуги курьерской доставки Uzum Tezkor и Yandex за смену', amount: 640000,
        quantity: 1, unit: 'отчёт', unitPrice: 640000, invoiceNumber: 'OSH-DEL-1115',
        spentAt: daysAgo(now, 3, 15), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-oth-1115', restaurantId: 'rest-osh', supplierId: supOshOther.id,
        category: ExpenseCategory.OTHER, itemName: 'Банковский эквайринг 1.2% (прочие расходы)',
        description: 'Комиссия торгового эквайринга 1.2% по терминалам и картам (прочие услуги банка)', amount: 285000,
        quantity: 1, unit: 'реестр', unitPrice: 285000, invoiceNumber: 'OSH-ACQ-1115',
        spentAt: daysAgo(now, 3, 16), source: 'MANUAL', isVerified: true,
      },

      // Earlier in last week (daysAgo 4..9, Mon Nov 9 – Sat Nov 14)
      {
        id: 'seed-exp-osh-tax-w1', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'Социальный налог ЕСП 12% и НДФЛ',
        description: 'Налоговые отчисления ЕСП 12% и НДФЛ в ГНК по штатным сотрудникам', amount: 1380000,
        quantity: 12, unit: 'чел', unitPrice: 115000, invoiceNumber: 'OSH-TAX-1109',
        spentAt: daysAgo(now, 9, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-el-w1-3ph', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия 3-фазная: холодильная камера и печи',
        description: 'Трёхфазный счётчик электроэнергии РЭС: холодный цех и жарочные шкафы (740 кВт·ч)', amount: 666000,
        quantity: 740, unit: 'кВт·ч', unitPrice: 900, invoiceNumber: 'OSH-RES-1109',
        spentAt: daysAgo(now, 9, 12), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-ing-w1-oil', restaurantId: 'rest-osh', supplierId: supRice.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Масло хлопковое рафинированное',
        description: 'Масло хлопковое для казанов плова (50 л)', amount: 950000,
        quantity: 50, unit: 'л', unitPrice: 19000, invoiceNumber: 'OSH-ING-1109',
        spentAt: daysAgo(now, 9, 14), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-water-w1', restaurantId: 'rest-osh', supplierId: supOshWater.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Водоснабжение и канализация Сувсоз',
        description: 'Оплата холодной воды и канализации Сувсоз по счётчику (68 м³)', amount: 285600,
        quantity: 68, unit: 'м³', unitPrice: 4200, invoiceNumber: 'OSH-WAT-1110',
        spentAt: daysAgo(now, 8, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-eqp-w1', restaurantId: 'rest-osh', supplierId: supOshEqp.id,
        category: ExpenseCategory.EQUIPMENT, itemName: 'Ремонт и ТО печей и холодильников',
        description: 'Техническое обслуживание кухонного оборудования, пароконвектомата и холодильников', amount: 720000,
        quantity: 1, unit: 'акт', unitPrice: 720000, invoiceNumber: 'OSH-EQP-1110',
        spentAt: daysAgo(now, 8, 15), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-tax-w2-mun', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'Местный торговый сбор и земельный налог',
        description: 'Муниципальный сбор за право торговли и земельный налог в ГНК', amount: 540000,
        quantity: 1, unit: 'кв-л', unitPrice: 540000, invoiceNumber: 'OSH-TAX-1111',
        spentAt: daysAgo(now, 7, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-mkt-w1', restaurantId: 'rest-osh', supplierId: supOshMkt.id,
        category: ExpenseCategory.MARKETING, itemName: 'Таргетированная реклама Instagram и Telegram',
        description: 'Продвижение комбо-обедов и таргетинг в Instagram и Telegram Ads', amount: 850000,
        quantity: 1, unit: 'камп', unitPrice: 850000, invoiceNumber: 'OSH-MKT-1111',
        spentAt: daysAgo(now, 7, 14), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-grease-w1', restaurantId: 'rest-osh', supplierId: supOshWater.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Вывоз ТБО и очистка жироуловителей канализации',
        description: 'Коммунальный вывоз отходов и плановая очистка жироуловителей канализации', amount: 370000,
        quantity: 2, unit: 'рейс', unitPrice: 185000, invoiceNumber: 'OSH-GRS-1112',
        spentAt: daysAgo(now, 6, 12), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-del-w1', restaurantId: 'rest-osh', supplierId: supOshDel.id,
        category: ExpenseCategory.DELIVERY, itemName: 'Топливо (бензин) и термосумки курьеров',
        description: 'Компенсация бензина АИ-92 и термосумки для курьеров доставки', amount: 495000,
        quantity: 45, unit: 'л', unitPrice: 11000, invoiceNumber: 'OSH-DEL-1112',
        spentAt: daysAgo(now, 6, 15), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-comm-w1', restaurantId: 'rest-osh', supplierId: supTelecom.id,
        category: ExpenseCategory.COMMUNICATION, itemName: 'SMS-пакет и мобильная связь (Beeline)',
        description: 'Пакет SMS-уведомлений клиентам и мобильный интернет POS-терминалов', amount: 192000,
        quantity: 1600, unit: 'смс', unitPrice: 120, invoiceNumber: 'OSH-SMS-1113',
        spentAt: daysAgo(now, 5, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-ing-w1-spices', restaurantId: 'rest-osh', supplierId: supRice.id,
        category: ExpenseCategory.INGREDIENTS, itemName: 'Лук, нут и зира для плова',
        description: 'Репчатый лук, нут, барбарис и горная зира (ингредиенты)', amount: 720000,
        quantity: 60, unit: 'кг', unitPrice: 12000, invoiceNumber: 'OSH-ING-1113',
        spentAt: daysAgo(now, 5, 13), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-tax-w3-pen', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'Пеня ГНК по налогу с оборота',
        description: 'Корректировка и пеня ГНК за уточнение налоговой декларации', amount: 145000,
        quantity: 1, unit: 'квит', unitPrice: 145000, invoiceNumber: 'OSH-TAX-1114',
        spentAt: daysAgo(now, 4, 14), source: 'MANUAL', isVerified: false,
      },
      {
        id: 'seed-exp-osh-eqp-w1-hood', restaurantId: 'rest-osh', supplierId: supOshEqp.id,
        category: ExpenseCategory.EQUIPMENT, itemName: 'Чистка вытяжки и замена фильтров оборудования',
        description: 'Сервис вытяжной вентиляции, зонтов и замена фильтров кухонного оборудования', amount: 460000,
        quantity: 1, unit: 'акт', unitPrice: 460000, invoiceNumber: 'OSH-EQP-1114',
        spentAt: daysAgo(now, 4, 15), source: 'MANUAL', isVerified: true,
      },

      // Current week (daysAgo 0..2, Nov 16-18)
      {
        id: 'seed-exp-osh-rent-wh', restaurantId: 'rest-osh', supplierId: supRent.id,
        category: ExpenseCategory.RENT, itemName: 'Аренда производственного склада',
        description: 'Аренда сухого и холодильного складского помещения (доп. секция)', amount: 850000,
        quantity: 1, unit: 'мес', unitPrice: 850000, invoiceNumber: 'OSH-RNT-1116',
        spentAt: daysAgo(now, 2, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-pack-cutlery', restaurantId: 'rest-osh', supplierId: supPack.id,
        category: ExpenseCategory.PACKAGING, itemName: 'Крафт-пакеты, приборы и салфетки',
        description: 'Бумажные пакеты, столовые приборы, соусники и влажные салфетки', amount: 420000,
        quantity: 1200, unit: 'компл', unitPrice: 350, invoiceNumber: 'OSH-PACK-1116',
        spentAt: daysAgo(now, 2, 13), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-el-1117', restaurantId: 'rest-osh', supplierId: supUtil.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия РЭС (основной ввод)',
        description: 'Счёт РЭС за электроэнергию кухонной линии и освещения зала (680 кВт·ч)', amount: 578000,
        quantity: 680, unit: 'кВт·ч', unitPrice: 850, invoiceNumber: 'OSH-RES-1117',
        spentAt: daysAgo(now, 1, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-sal-1117', restaurantId: 'rest-osh', supplierId: null,
        category: ExpenseCategory.SALARY, itemName: 'Сверхурочные смены персонала и курьеров (ФОТ)',
        description: 'Зарплата и доплата за ночные смены штатных сотрудников и курьеров (ФОТ)', amount: 900000,
        quantity: 5, unit: 'чел', unitPrice: 180000, invoiceNumber: 'OSH-PAY-1117',
        spentAt: daysAgo(now, 1, 16), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-tax-1118', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'НДС 12% промежуточный платёж (ГНК)',
        description: 'Уплата НДС 12% по текущему реестру счетов-фактур в ГНК', amount: 620000,
        quantity: 1, unit: 'реестр', unitPrice: 620000, invoiceNumber: 'OSH-TAX-1118',
        spentAt: daysAgo(now, 0, 9), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-oth-pos', restaurantId: 'rest-osh', supplierId: supOshOther.id,
        category: ExpenseCategory.OTHER, itemName: 'Лицензия ПО iiko / POS-система',
        description: 'Ежемесячная подписка кассового ПО iiko и прочие сервисы автоматизации', amount: 490000,
        quantity: 1, unit: 'мес', unitPrice: 490000, invoiceNumber: 'OSH-POS-1118',
        spentAt: daysAgo(now, 0, 11), source: 'MANUAL', isVerified: true,
      },

      // Earlier in current month (daysAgo 14..16)
      {
        id: 'seed-exp-osh-ses-early', restaurantId: 'rest-osh', supplierId: supOshOther.id,
        category: ExpenseCategory.OTHER, itemName: 'Санитарная инспекция СЭС и дезинфекция',
        description: 'Плановая дезинфекция помещений и санитарный контроль СЭС по СанПиН', amount: 390000,
        quantity: 1, unit: 'акт', unitPrice: 390000, invoiceNumber: 'OSH-SES-1103',
        spentAt: inCurrentMonth(now, monthStart, 15, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-mkt-early', restaurantId: 'rest-osh', supplierId: supOshMkt.id,
        category: ExpenseCategory.MARKETING, itemName: 'Промо-флаеры, баннеры и акции в соцсетях',
        description: 'Печать промо-флаеров, тейбл-тентов и оформление рекламных баннеров', amount: 320000,
        quantity: 1000, unit: 'шт', unitPrice: 320, invoiceNumber: 'OSH-MKT-1103',
        spentAt: inCurrentMonth(now, monthStart, 15, 14), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-tax-early', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'Аванс по налогу с оборота ЕНП (ГНК)',
        description: 'Авансовый налоговый платёж в ГНК за начало месяца', amount: 740000,
        quantity: 1, unit: 'платёж', unitPrice: 740000, invoiceNumber: 'OSH-TAX-1104',
        spentAt: inCurrentMonth(now, monthStart, 14, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-gas-early', restaurantId: 'rest-osh', supplierId: supOshGas.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Природный газ Худудгаз (начало месяца)',
        description: 'Оплата природного газа Худудгаз по счётчику (350 м³)', amount: 525000,
        quantity: 350, unit: 'м³', unitPrice: 1500, invoiceNumber: 'OSH-GAS-1104',
        spentAt: inCurrentMonth(now, monthStart, 14, 12), source: 'MANUAL', isVerified: true,
      },

      // Previous month baseline for rest-osh across Taxes, Gas, Delivery, Equipment, Marketing, Other
      {
        id: 'seed-exp-osh-tax-prev-1', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'НДС 12% (прошлый месяц, ГНК)',
        description: 'Уплата НДС 12% в государственный бюджет по декларации ГНК за прошлый месяц', amount: 1180000,
        quantity: 1, unit: 'дек', unitPrice: 1180000, invoiceNumber: 'OSH-TAX-1015',
        spentAt: daysAgo(now, 34, 10), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-tax-prev-2', restaurantId: 'rest-osh', supplierId: supOshTax.id,
        category: ExpenseCategory.TAXES, itemName: 'Налог с оборота ЕНП и ЕСП 12% (прошлый месяц)',
        description: 'Социальный налог ЕСП 12% и налог с оборота в ГНК за прошлый месяц', amount: 1420000,
        quantity: 1, unit: 'дек', unitPrice: 1420000, invoiceNumber: 'OSH-TAX-1020',
        spentAt: daysAgo(now, 32, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-gas-prev', restaurantId: 'rest-osh', supplierId: supOshGas.id,
        category: ExpenseCategory.UTILITIES, itemName: 'Природный газ Худудгаз (прошлый месяц)',
        description: 'Оплата природного газа Худудгаз по счётчику (620 м³)', amount: 930000,
        quantity: 620, unit: 'м³', unitPrice: 1500, invoiceNumber: 'OSH-GAS-1018',
        spentAt: daysAgo(now, 33, 11), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-del-prev', restaurantId: 'rest-osh', supplierId: supOshDel.id,
        category: ExpenseCategory.DELIVERY, itemName: 'Комиссия агрегатора и топливо (прошлый месяц)',
        description: 'Услуги курьерской доставки и бензин курьеров за прошлый месяц', amount: 980000,
        quantity: 1, unit: 'мес', unitPrice: 980000, invoiceNumber: 'OSH-DEL-1025',
        spentAt: daysAgo(now, 35, 15), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-eqp-prev', restaurantId: 'rest-osh', supplierId: supOshEqp.id,
        category: ExpenseCategory.EQUIPMENT, itemName: 'Плановое ТО оборудования кухни (прошлый месяц)',
        description: 'Обслуживание холодильников, плит и вытяжки за прошлый месяц', amount: 650000,
        quantity: 1, unit: 'акт', unitPrice: 650000, invoiceNumber: 'OSH-EQP-1022',
        spentAt: daysAgo(now, 36, 14), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-mkt-prev', restaurantId: 'rest-osh', supplierId: supOshMkt.id,
        category: ExpenseCategory.MARKETING, itemName: 'Реклама Instagram и Telegram (прошлый месяц)',
        description: 'Таргетированная реклама и продвижение за прошлый месяц', amount: 720000,
        quantity: 1, unit: 'мес', unitPrice: 720000, invoiceNumber: 'OSH-MKT-1024',
        spentAt: daysAgo(now, 37, 13), source: 'MANUAL', isVerified: true,
      },
      {
        id: 'seed-exp-osh-oth-prev', restaurantId: 'rest-osh', supplierId: supOshOther.id,
        category: ExpenseCategory.OTHER, itemName: 'ПО iiko и банковский эквайринг (прошлый месяц)',
        description: 'Лицензия iiko и комиссия эквайринга 1.2% (прочие расходы)', amount: 710000,
        quantity: 1, unit: 'мес', unitPrice: 710000, invoiceNumber: 'OSH-OTH-1026',
        spentAt: daysAgo(now, 38, 12), source: 'MANUAL', isVerified: true,
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
      { id: 'seed-budget-tax', restaurantId: 'rest-osh', category: ExpenseCategory.TAXES, month: monthStart, limit: 5500000 },
      { id: 'seed-budget-del', restaurantId: 'rest-osh', category: ExpenseCategory.DELIVERY, month: monthStart, limit: 1400000 },
      { id: 'seed-budget-eqp', restaurantId: 'rest-osh', category: ExpenseCategory.EQUIPMENT, month: monthStart, limit: 1500000 },
      { id: 'seed-budget-mkt', restaurantId: 'rest-osh', category: ExpenseCategory.MARKETING, month: monthStart, limit: 1400000 },
      { id: 'seed-budget-oth', restaurantId: 'rest-osh', category: ExpenseCategory.OTHER, month: monthStart, limit: 1300000 },
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

  // Enrich all other 5 branches (Basilico, Burger Bureau, Non House, Mori, Saffron) with full itemized coverage
  await seedBranchOperationalEnrichment(prisma, now, monthStart, {
    restaurantId: 'rest-basilico',
    code: 'BAS',
    scale: 0.72,
    utilSupplierId: basUtil.id,
    ingSupplierId: basOil.id,
    specialties: {
      ing15Name: 'Томаты Pelati и мука Caputo 00',
      ing15Desc: 'Итальянские томаты и мука для теста пиццы и пасты (ингредиенты)',
      ing15Qty: 45,
      ing15Unit: 'кг',
      ing15UnitPrice: 24000,
      ingW1Name: 'Сливки 33% и пармезан тёртый',
      ingW1Desc: 'Молочные продукты и сыр для соусов пасты',
      ingW1Qty: 18,
      ingW1Unit: 'кг',
      ingW1UnitPrice: 68000,
      packName: 'Коробки для пиццы 32 см и крафт-пакеты',
      packDesc: 'Фирменные коробки для пиццы, пакеты и столовые приборы',
      eqpName: 'Обслуживание итальянской пицца-печи и холодильников',
      eqpDesc: 'ТО подовой печи, холодильных столов и вытяжного оборудования',
      rentName: 'Аренда кухни и склада на ул. Руставели',
      rentDesc: 'Аренда производственной кухни и складского помещения',
    },
  });

  await seedBranchOperationalEnrichment(prisma, now, monthStart, {
    restaurantId: 'rest-burger',
    code: 'BUR',
    scale: 0.65,
    ingSupplierId: burSup1.id,
    specialties: {
      ing15Name: 'Булочки бриошь и соус чеддер (ингредиенты)',
      ing15Desc: 'Свежие булочки бриошь, мука и фирменный сырный соус (ингредиенты)',
      ing15Qty: 40,
      ing15Unit: 'кг',
      ing15UnitPrice: 26000,
      ingW1Name: 'Сыр чеддер слайсы и овощи для бургеров',
      ingW1Desc: 'Сыр чеддер, томаты, салат айсберг и маринованные огурцы',
      ingW1Qty: 22,
      ingW1Unit: 'кг',
      ingW1UnitPrice: 48000,
      packName: 'Крафт-обёртка, ланч-боксы и стаканы',
      packDesc: 'Жиростойкая упаковка для бургеров, коробки и крафт-пакеты',
      eqpName: 'Ремонт гриля, фритюрницы и вытяжки',
      eqpDesc: 'Сервис контактного гриля, фритюрных ванн и вентиляционного оборудования',
      rentName: 'Аренда зала и кухни Burger Bureau',
      rentDesc: 'Аренда помещения на ул. Шахрисабз',
    },
    skipExistingBudgets: [ExpenseCategory.INGREDIENTS, ExpenseCategory.SALARY],
  });

  await seedBranchOperationalEnrichment(prisma, now, monthStart, {
    restaurantId: 'rest-non',
    code: 'NON',
    scale: 0.52,
    specialties: {
      ing15Name: 'Сливочное масло 82.5% и сливки для выпечки',
      ing15Desc: 'Сливочное масло, молоко и сливки для слоёного теста и капучино',
      ing15Qty: 25,
      ing15Unit: 'кг',
      ing15UnitPrice: 54000,
      ingW1Name: 'Зерновой кофе, молоко и мука высший сорт',
      ingW1Desc: 'Мука, молоко и ингредиенты для утренних завтраков и круассанов',
      ingW1Qty: 30,
      ingW1Unit: 'кг',
      ingW1UnitPrice: 28000,
      packName: 'Стаканы для кофе с крышками и крафт-пакеты',
      packDesc: 'Бумажные стаканы 250/350 мл, крышки, салфетки и пакеты',
      eqpName: 'Декальцинация кофемашины и ТО расстоечного шкафа',
      eqpDesc: 'Техническое обслуживание эспрессо-машины, печи и фильтров оборудования',
      rentName: 'Аренда пекарни и кофейного зала',
      rentDesc: 'Аренда помещения на ул. Нукус',
    },
    skipExistingBudgets: [ExpenseCategory.INGREDIENTS, ExpenseCategory.UTILITIES],
  });

  await seedBranchOperationalEnrichment(prisma, now, monthStart, {
    restaurantId: 'rest-mori',
    code: 'MORI',
    scale: 0.68,
    ingSupplierId: moriFish.id,
    specialties: {
      ing15Name: 'Рис для суши, соус унаги и овощи',
      ing15Desc: 'Японский рис, нори, соевый соус, авокадо и овощи для роллов',
      ing15Qty: 35,
      ing15Unit: 'кг',
      ing15UnitPrice: 36000,
      ingW1Name: 'Сливочный сыр Cremette и лапша удон',
      ingW1Desc: 'Творожный сыр для роллов и пшеничная лапша (ингредиенты)',
      ingW1Qty: 20,
      ingW1Unit: 'кг',
      ingW1UnitPrice: 58000,
      packName: 'Суши-боксы, соусники и палочки',
      packDesc: 'Контейнеры для роллов, крафт-пакеты и одноразовые приборы',
      eqpName: 'Обслуживание суши-витрин и морозильной камеры',
      eqpDesc: 'Сервис шоковой морозильной камеры, холодильных витрин и рисоварки',
      rentName: 'Аренда зала и холодного цеха Mori',
      rentDesc: 'Аренда помещения на ул. Садыка Азимова',
    },
    skipExistingBudgets: [ExpenseCategory.INGREDIENTS, ExpenseCategory.PACKAGING],
  });

  await seedBranchOperationalEnrichment(prisma, now, monthStart, {
    restaurantId: 'rest-saffron',
    code: 'SAF',
    scale: 0.56,
    specialties: {
      ing15Name: 'Филе куриное, рис басмати и специи карри',
      ing15Desc: 'Охлаждённое куриное филе, рис басмати и пряные специи (ингредиенты)',
      ing15Qty: 30,
      ing15Unit: 'кг',
      ing15UnitPrice: 42000,
      ingW1Name: 'Томаты, сливки и топлёное масло гхи',
      ingW1Desc: 'Свежие томаты, сливки и масло для соусов карри и бирьяни',
      ingW1Qty: 24,
      ingW1Unit: 'кг',
      ingW1UnitPrice: 32000,
      packName: 'Фольгированные ланч-боксы и крафт-пакеты',
      packDesc: 'Термостойкие контейнеры для карри, пакеты и приборы',
      eqpName: 'Обслуживание тандура, плит и вытяжки кухни',
      eqpDesc: 'Ремонт и чистка газовых плит, тандура и вытяжного оборудования',
      rentName: 'Аренда помещения ресторана Saffron',
      rentDesc: 'Аренда зала, кухни и склада на ул. Махтумкули',
    },
    skipExistingBudgets: [ExpenseCategory.INGREDIENTS, ExpenseCategory.UTILITIES],
  });
}

interface BranchEnrichmentConfig {
  restaurantId: string;
  code: string;
  scale: number;
  utilSupplierId?: string;
  ingSupplierId?: string;
  skipExistingBudgets?: ExpenseCategory[];
  specialties: {
    ing15Name: string;
    ing15Desc: string;
    ing15Qty: number;
    ing15Unit: string;
    ing15UnitPrice: number;
    ingW1Name: string;
    ingW1Desc: string;
    ingW1Qty: number;
    ingW1Unit: string;
    ingW1UnitPrice: number;
    packName: string;
    packDesc: string;
    eqpName: string;
    eqpDesc: string;
    rentName: string;
    rentDesc: string;
  };
}

async function seedBranchOperationalEnrichment(
  prisma: PrismaClient,
  now: Date,
  monthStart: Date,
  cfg: BranchEnrichmentConfig,
) {
  const round5k = (v: number) => Math.max(50000, Math.round((v * cfg.scale) / 5000) * 5000);
  const kwhQty = (base: number) => Math.max(120, Math.round((base * cfg.scale) / 10) * 10);
  const gasQty = (base: number) => Math.max(80, Math.round((base * cfg.scale) / 10) * 10);
  const waterQty = (base: number) => Math.max(20, Math.round(base * cfg.scale));
  const c = cfg.code.toLowerCase();

  const supTax = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-tax`, restaurantId: cfg.restaurantId, name: 'ГНК г. Ташкента (Soliq.uz)', taxId: '200000112', category: ExpenseCategory.TAXES },
  });
  const supUtil = cfg.utilSupplierId
    ? { id: cfg.utilSupplierId }
    : await prisma.supplier.create({
        data: { id: `seed-sup-${c}-util`, restaurantId: cfg.restaurantId, name: 'Toshkent Elektr (РЭС)', taxId: '200112299', category: ExpenseCategory.UTILITIES },
      });
  const supGas = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-gas`, restaurantId: cfg.restaurantId, name: 'Худудгаз Тошкент', taxId: '200224488', category: ExpenseCategory.UTILITIES },
  });
  const supWater = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-wat`, restaurantId: cfg.restaurantId, name: 'Сувсоз & ЖБО Сервис', taxId: '200335599', category: ExpenseCategory.UTILITIES },
  });
  const supComm = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-comm`, restaurantId: cfg.restaurantId, name: 'Uztelecom & Beeline Business', taxId: '200998877', category: ExpenseCategory.COMMUNICATION },
  });
  const supPack = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-pack`, restaurantId: cfg.restaurantId, name: 'EcoPack Tashkent', taxId: '307665544', category: ExpenseCategory.PACKAGING },
  });
  const supDel = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-del`, restaurantId: cfg.restaurantId, name: 'Uzum Tezkor & Yandex Delivery', taxId: '310442211', category: ExpenseCategory.DELIVERY },
  });
  const supEqp = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-eqp`, restaurantId: cfg.restaurantId, name: 'ChefTech Service UZ', taxId: '308771122', category: ExpenseCategory.EQUIPMENT },
  });
  const supMkt = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-mkt`, restaurantId: cfg.restaurantId, name: 'Tashkent Digital SMM', taxId: '309112244', category: ExpenseCategory.MARKETING },
  });
  const supOther = await prisma.supplier.create({
    data: { id: `seed-sup-${c}-oth`, restaurantId: cfg.restaurantId, name: 'iiko & Bank Acquiring', taxId: '201556677', category: ExpenseCategory.OTHER },
  });

  const el15DayKwh = kwhQty(680);
  const el15NightKwh = kwhQty(380);
  const elW13phKwh = kwhQty(520);
  const gas15M3 = gasQty(260);
  const waterW1M3 = waterQty(48);

  const vat15 = round5k(980000);
  const turnW1 = round5k(640000);
  const espW1 = round5k(1050000);
  const munW1 = round5k(420000);
  const pen15 = round5k(125000);
  const taxPrev1 = round5k(920000);
  const taxPrev2 = round5k(1150000);

  const sal15 = round5k(1650000);
  const salPrev = round5k(2100000);
  const rentW1 = round5k(1850000);
  const rentPrev = round5k(1800000);
  const commCurr = round5k(360000);
  const commSms = round5k(140000);
  const commPrev = round5k(320000);
  const pack15 = round5k(420000);
  const packPrev = round5k(380000);
  const del15 = round5k(480000);
  const delW1 = round5k(310000);
  const delPrev = round5k(540000);
  const eqpW1 = round5k(490000);
  const eqpPrev = round5k(420000);
  const mktW1 = round5k(550000);
  const mktPrev = round5k(480000);
  const othPos = round5k(380000);
  const othAcq = round5k(220000);
  const othSes = round5k(310000);
  const othPrev = round5k(560000);

  const rows: Array<{
    id: string;
    restaurantId: string;
    supplierId: string | null;
    category: ExpenseCategory;
    itemName: string;
    description: string;
    amount: number;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    invoiceNumber: string;
    spentAt: Date;
    source: string;
    isVerified: boolean;
  }> = [
    // Nov 15 (daysAgo 3)
    {
      id: `seed-exp-${c}-tax-1115`, restaurantId: cfg.restaurantId, supplierId: supTax.id,
      category: ExpenseCategory.TAXES, itemName: 'НДС 12% по реализации (ГНК)',
      description: 'Уплата НДС 12% в государственный бюджет по декларации ГНК', amount: vat15,
      quantity: 1, unit: 'дек', unitPrice: vat15, invoiceNumber: `${cfg.code}-TAX-1115`,
      spentAt: daysAgo(now, 3, 9), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-tax-1115-adv`, restaurantId: cfg.restaurantId, supplierId: supTax.id,
      category: ExpenseCategory.TAXES, itemName: 'Налог с оборота ЕНП (аванс и пеня ГНК)',
      description: 'Авансовый платёж налога с оборота ЕНП и пеня ГНК за уточнение отчёта', amount: pen15,
      quantity: 1, unit: 'квит', unitPrice: pen15, invoiceNumber: `${cfg.code}-TAX-1115P`,
      spentAt: daysAgo(now, 3, 14), source: 'MANUAL', isVerified: false,
    },
    {
      id: `seed-exp-${c}-el-1115-d`, restaurantId: cfg.restaurantId, supplierId: supUtil.id,
      category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия РЭС (дневной тариф)',
      description: `Счёт РЭС за дневное потребление электроэнергии кухни (${el15DayKwh} кВт·ч)`, amount: el15DayKwh * 900,
      quantity: el15DayKwh, unit: 'кВт·ч', unitPrice: 900, invoiceNumber: `${cfg.code}-RES-1115D`,
      spentAt: daysAgo(now, 3, 8), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-el-1115-n`, restaurantId: cfg.restaurantId, supplierId: supUtil.id,
      category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия РЭС (ночной тариф)',
      description: `Счёт РЭС за ночное потребление электроэнергии холодильников (${el15NightKwh} кВт·ч)`, amount: el15NightKwh * 650,
      quantity: el15NightKwh, unit: 'кВт·ч', unitPrice: 650, invoiceNumber: `${cfg.code}-RES-1115N`,
      spentAt: daysAgo(now, 3, 8), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-gas-1115`, restaurantId: cfg.restaurantId, supplierId: supGas.id,
      category: ExpenseCategory.UTILITIES, itemName: 'Природный газ Худудгаз',
      description: `Оплата природного газа Худудгаз по счётчику (${gas15M3} м³)`, amount: gas15M3 * 1500,
      quantity: gas15M3, unit: 'м³', unitPrice: 1500, invoiceNumber: `${cfg.code}-GAS-1115`,
      spentAt: daysAgo(now, 3, 11), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-ing-1115`, restaurantId: cfg.restaurantId, supplierId: cfg.ingSupplierId ?? null,
      category: ExpenseCategory.INGREDIENTS, itemName: cfg.specialties.ing15Name,
      description: cfg.specialties.ing15Desc, amount: cfg.specialties.ing15Qty * cfg.specialties.ing15UnitPrice,
      quantity: cfg.specialties.ing15Qty, unit: cfg.specialties.ing15Unit, unitPrice: cfg.specialties.ing15UnitPrice,
      invoiceNumber: `${cfg.code}-ING-1115`, spentAt: daysAgo(now, 3, 10), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-sal-1115`, restaurantId: cfg.restaurantId, supplierId: null,
      category: ExpenseCategory.SALARY, itemName: 'Сменная зарплата поваров и кассиров (ФОТ)',
      description: 'Зарплата и аванс персоналу кухни, зала и кассирам за смены 1–15 числа (ФОТ)', amount: sal15,
      quantity: 1, unit: 'ведом.', unitPrice: sal15, invoiceNumber: `${cfg.code}-PAY-1115`,
      spentAt: daysAgo(now, 3, 16), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-pack-1115`, restaurantId: cfg.restaurantId, supplierId: supPack.id,
      category: ExpenseCategory.PACKAGING, itemName: cfg.specialties.packName,
      description: cfg.specialties.packDesc, amount: pack15,
      quantity: 1, unit: 'партия', unitPrice: pack15, invoiceNumber: `${cfg.code}-PACK-1115`,
      spentAt: daysAgo(now, 3, 13), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-del-1115`, restaurantId: cfg.restaurantId, supplierId: supDel.id,
      category: ExpenseCategory.DELIVERY, itemName: 'Комиссия агрегатора доставки',
      description: 'Услуги курьерской доставки Uzum Tezkor и Yandex за период', amount: del15,
      quantity: 1, unit: 'отчёт', unitPrice: del15, invoiceNumber: `${cfg.code}-DEL-1115`,
      spentAt: daysAgo(now, 3, 15), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-oth-1115`, restaurantId: cfg.restaurantId, supplierId: supOther.id,
      category: ExpenseCategory.OTHER, itemName: 'Банковский эквайринг 1.2% (прочие расходы)',
      description: 'Комиссия торгового эквайринга 1.2% по терминалам и картам (прочие банковские услуги)', amount: othAcq,
      quantity: 1, unit: 'реестр', unitPrice: othAcq, invoiceNumber: `${cfg.code}-ACQ-1115`,
      spentAt: daysAgo(now, 3, 16), source: 'MANUAL', isVerified: true,
    },

    // Last week (daysAgo 4..9, Mon Nov 9 – Sat Nov 14)
    {
      id: `seed-exp-${c}-tax-w1-esp`, restaurantId: cfg.restaurantId, supplierId: supTax.id,
      category: ExpenseCategory.TAXES, itemName: 'Социальный налог ЕСП 12% и НДФЛ',
      description: 'Налоговые отчисления ЕСП 12% и НДФЛ в ГНК по штатным сотрудникам', amount: espW1,
      quantity: 1, unit: 'дек', unitPrice: espW1, invoiceNumber: `${cfg.code}-TAX-1109`,
      spentAt: daysAgo(now, 9, 10), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-el-w1-3ph`, restaurantId: cfg.restaurantId, supplierId: supUtil.id,
      category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия 3-фазная: холодильная камера и печи',
      description: `Трёхфазный счётчик электроэнергии РЭС: холодный цех и печи (${elW13phKwh} кВт·ч)`, amount: elW13phKwh * 900,
      quantity: elW13phKwh, unit: 'кВт·ч', unitPrice: 900, invoiceNumber: `${cfg.code}-RES-1109`,
      spentAt: daysAgo(now, 9, 12), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-wat-w1`, restaurantId: cfg.restaurantId, supplierId: supWater.id,
      category: ExpenseCategory.UTILITIES, itemName: 'Водоснабжение, канализация Сувсоз и жироуловители',
      description: `Холодная вода Сувсоз (${waterW1M3} м³) и вывоз ЖБО канализации`, amount: waterW1M3 * 4500,
      quantity: waterW1M3, unit: 'м³', unitPrice: 4500, invoiceNumber: `${cfg.code}-WAT-1110`,
      spentAt: daysAgo(now, 8, 11), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-eqp-w1`, restaurantId: cfg.restaurantId, supplierId: supEqp.id,
      category: ExpenseCategory.EQUIPMENT, itemName: cfg.specialties.eqpName,
      description: cfg.specialties.eqpDesc, amount: eqpW1,
      quantity: 1, unit: 'акт', unitPrice: eqpW1, invoiceNumber: `${cfg.code}-EQP-1110`,
      spentAt: daysAgo(now, 8, 15), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-tax-w1-turn`, restaurantId: cfg.restaurantId, supplierId: supTax.id,
      category: ExpenseCategory.TAXES, itemName: 'Налог с оборота (ЕНП 4%)',
      description: 'Налог с оборота ЕНП 4% по расчёту ГНК', amount: turnW1,
      quantity: 1, unit: 'платёж', unitPrice: turnW1, invoiceNumber: `${cfg.code}-TAX-1111`,
      spentAt: daysAgo(now, 7, 10), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-mkt-w1`, restaurantId: cfg.restaurantId, supplierId: supMkt.id,
      category: ExpenseCategory.MARKETING, itemName: 'Таргетированная реклама Instagram и Telegram',
      description: 'Реклама в Instagram, Telegram Ads и промо-акции', amount: mktW1,
      quantity: 1, unit: 'камп', unitPrice: mktW1, invoiceNumber: `${cfg.code}-MKT-1111`,
      spentAt: daysAgo(now, 7, 14), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-del-w1`, restaurantId: cfg.restaurantId, supplierId: supDel.id,
      category: ExpenseCategory.DELIVERY, itemName: 'Топливо (бензин) и термосумки курьеров',
      description: 'Компенсация бензина и термосумки для курьеров доставки', amount: delW1,
      quantity: 1, unit: 'ведом.', unitPrice: delW1, invoiceNumber: `${cfg.code}-DEL-1112`,
      spentAt: daysAgo(now, 6, 13), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-comm-w1`, restaurantId: cfg.restaurantId, supplierId: supComm.id,
      category: ExpenseCategory.COMMUNICATION, itemName: 'Интернет, IP-телефония SIP и SMS-пакет',
      description: 'Оптоволоконный интернет, телефония Uztelecom и SMS-уведомления Beeline', amount: commCurr,
      quantity: 1, unit: 'мес', unitPrice: commCurr, invoiceNumber: `${cfg.code}-COM-1112`,
      spentAt: daysAgo(now, 6, 15), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-ing-w1`, restaurantId: cfg.restaurantId, supplierId: cfg.ingSupplierId ?? null,
      category: ExpenseCategory.INGREDIENTS, itemName: cfg.specialties.ingW1Name,
      description: cfg.specialties.ingW1Desc, amount: cfg.specialties.ingW1Qty * cfg.specialties.ingW1UnitPrice,
      quantity: cfg.specialties.ingW1Qty, unit: cfg.specialties.ingW1Unit, unitPrice: cfg.specialties.ingW1UnitPrice,
      invoiceNumber: `${cfg.code}-ING-1113`, spentAt: daysAgo(now, 5, 11), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-tax-w1-mun`, restaurantId: cfg.restaurantId, supplierId: supTax.id,
      category: ExpenseCategory.TAXES, itemName: 'Местный торговый сбор и земельный налог',
      description: 'Муниципальный сбор за право торговли и земельный налог ГНК', amount: munW1,
      quantity: 1, unit: 'кв-л', unitPrice: munW1, invoiceNumber: `${cfg.code}-TAX-1114`,
      spentAt: daysAgo(now, 4, 11), source: 'MANUAL', isVerified: true,
    },

    // Current week (daysAgo 0..2) & Early current month (daysAgo 13..15)
    {
      id: `seed-exp-${c}-comm-sms`, restaurantId: cfg.restaurantId, supplierId: supComm.id,
      category: ExpenseCategory.COMMUNICATION, itemName: 'SMS-пакет кассы и мобильная связь',
      description: 'Пакет SMS-уведомлений клиентам и резервный интернет POS-касс', amount: commSms,
      quantity: 1, unit: 'пакет', unitPrice: commSms, invoiceNumber: `${cfg.code}-SMS-1116`,
      spentAt: daysAgo(now, 2, 11), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-oth-pos`, restaurantId: cfg.restaurantId, supplierId: supOther.id,
      category: ExpenseCategory.OTHER, itemName: 'Лицензия ПО iiko / POS-система',
      description: 'Ежемесячная подписка кассового ПО iiko и прочие сервисы автоматизации', amount: othPos,
      quantity: 1, unit: 'мес', unitPrice: othPos, invoiceNumber: `${cfg.code}-POS-1102`,
      spentAt: inCurrentMonth(now, monthStart, 16, 10), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-oth-ses`, restaurantId: cfg.restaurantId, supplierId: supOther.id,
      category: ExpenseCategory.OTHER, itemName: 'Санитарная инспекция СЭС и дезинфекция',
      description: 'Плановая дезинфекция помещений и санитарный контроль СЭС по СанПиН', amount: othSes,
      quantity: 1, unit: 'акт', unitPrice: othSes, invoiceNumber: `${cfg.code}-SES-1104`,
      spentAt: inCurrentMonth(now, monthStart, 14, 12), source: 'MANUAL', isVerified: true,
    },

    // Previous month (daysAgo 31..42)
    {
      id: `seed-exp-${c}-tax-prev-1`, restaurantId: cfg.restaurantId, supplierId: supTax.id,
      category: ExpenseCategory.TAXES, itemName: 'НДС 12% (прошлый месяц, ГНК)',
      description: 'Уплата НДС 12% в государственный бюджет по декларации ГНК за прошлый месяц', amount: taxPrev1,
      quantity: 1, unit: 'дек', unitPrice: taxPrev1, invoiceNumber: `${cfg.code}-TAX-1015`,
      spentAt: daysAgo(now, 34, 10), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-tax-prev-2`, restaurantId: cfg.restaurantId, supplierId: supTax.id,
      category: ExpenseCategory.TAXES, itemName: 'Налог с оборота ЕНП и ЕСП 12% (прошлый месяц)',
      description: 'Социальный налог ЕСП 12% и налог с оборота в ГНК за прошлый месяц', amount: taxPrev2,
      quantity: 1, unit: 'дек', unitPrice: taxPrev2, invoiceNumber: `${cfg.code}-TAX-1020`,
      spentAt: daysAgo(now, 32, 11), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-gas-prev`, restaurantId: cfg.restaurantId, supplierId: supGas.id,
      category: ExpenseCategory.UTILITIES, itemName: 'Электроэнергия РЭС и газ Худудгаз (прошлый месяц)',
      description: 'Коммунальные услуги за электроэнергию и природный газ за прошлый месяц', amount: round5k(980000),
      quantity: 1, unit: 'мес', unitPrice: round5k(980000), invoiceNumber: `${cfg.code}-UTL-1018`,
      spentAt: daysAgo(now, 33, 12), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-comm-prev`, restaurantId: cfg.restaurantId, supplierId: supComm.id,
      category: ExpenseCategory.COMMUNICATION, itemName: 'Интернет и телефония (прошлый месяц)',
      description: 'Корпоративный интернет и IP-телефония Uztelecom за прошлый месяц', amount: commPrev,
      quantity: 1, unit: 'мес', unitPrice: commPrev, invoiceNumber: `${cfg.code}-COM-1019`,
      spentAt: daysAgo(now, 35, 11), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-rent-prev`, restaurantId: cfg.restaurantId, supplierId: null,
      category: ExpenseCategory.RENT, itemName: `${cfg.specialties.rentName} (прошлый месяц)`,
      description: cfg.specialties.rentDesc, amount: rentPrev,
      quantity: 1, unit: 'мес', unitPrice: rentPrev, invoiceNumber: `${cfg.code}-RNT-1005`,
      spentAt: daysAgo(now, 38, 10), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-sal-prev`, restaurantId: cfg.restaurantId, supplierId: null,
      category: ExpenseCategory.SALARY, itemName: 'ФОТ персонала кухни и зала (прошлый месяц)',
      description: 'Зарплата поваров, официантов и кассиров за прошлый месяц (ФОТ)', amount: salPrev,
      quantity: 1, unit: 'ведом.', unitPrice: salPrev, invoiceNumber: `${cfg.code}-PAY-1028`,
      spentAt: daysAgo(now, 33, 17), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-pack-prev`, restaurantId: cfg.restaurantId, supplierId: supPack.id,
      category: ExpenseCategory.PACKAGING, itemName: `${cfg.specialties.packName} (прошлый месяц)`,
      description: cfg.specialties.packDesc, amount: packPrev,
      quantity: 1, unit: 'партия', unitPrice: packPrev, invoiceNumber: `${cfg.code}-PACK-1022`,
      spentAt: daysAgo(now, 36, 13), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-del-prev`, restaurantId: cfg.restaurantId, supplierId: supDel.id,
      category: ExpenseCategory.DELIVERY, itemName: 'Доставка и топливо курьеров (прошлый месяц)',
      description: 'Комиссия агрегатора доставки и бензин курьеров за прошлый месяц', amount: delPrev,
      quantity: 1, unit: 'мес', unitPrice: delPrev, invoiceNumber: `${cfg.code}-DEL-1025`,
      spentAt: daysAgo(now, 35, 15), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-eqp-prev`, restaurantId: cfg.restaurantId, supplierId: supEqp.id,
      category: ExpenseCategory.EQUIPMENT, itemName: 'ТО оборудования кухни (прошлый месяц)',
      description: cfg.specialties.eqpDesc, amount: eqpPrev,
      quantity: 1, unit: 'акт', unitPrice: eqpPrev, invoiceNumber: `${cfg.code}-EQP-1021`,
      spentAt: daysAgo(now, 37, 14), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-mkt-prev`, restaurantId: cfg.restaurantId, supplierId: supMkt.id,
      category: ExpenseCategory.MARKETING, itemName: 'Реклама и промо (прошлый месяц)',
      description: 'Таргетинг Instagram и Telegram за прошлый месяц', amount: mktPrev,
      quantity: 1, unit: 'мес', unitPrice: mktPrev, invoiceNumber: `${cfg.code}-MKT-1024`,
      spentAt: daysAgo(now, 39, 13), source: 'MANUAL', isVerified: true,
    },
    {
      id: `seed-exp-${c}-oth-prev`, restaurantId: cfg.restaurantId, supplierId: supOther.id,
      category: ExpenseCategory.OTHER, itemName: 'ПО iiko и эквайринг (прошлый месяц)',
      description: 'Лицензия iiko и комиссия банковского эквайринга (прочие расходы)', amount: othPrev,
      quantity: 1, unit: 'мес', unitPrice: othPrev, invoiceNumber: `${cfg.code}-OTH-1026`,
      spentAt: daysAgo(now, 40, 12), source: 'MANUAL', isVerified: true,
    },
  ];

  // Add current month RENT for branches that don't already have one (all except rest-basilico)
  if (cfg.restaurantId !== 'rest-basilico') {
    rows.push({
      id: `seed-exp-${c}-rent-curr`, restaurantId: cfg.restaurantId, supplierId: null,
      category: ExpenseCategory.RENT, itemName: cfg.specialties.rentName,
      description: cfg.specialties.rentDesc, amount: rentW1,
      quantity: 1, unit: 'мес', unitPrice: rentW1, invoiceNumber: `${cfg.code}-RNT-1105`,
      spentAt: inCurrentMonth(now, monthStart, 12, 10), source: 'MANUAL', isVerified: true,
    });
  }

  // Add current month MARKETING for branches that don't already have one in existing seed (rest-basilico has seed-exp-bas-mkt)
  if (cfg.restaurantId === 'rest-basilico') {
    // Also add current-week Packaging & Salary & Equipment already covered above; add promo flyers on daysAgo 1
    rows.push({
      id: `seed-exp-${c}-ing-1117`, restaurantId: cfg.restaurantId, supplierId: cfg.ingSupplierId ?? null,
      category: ExpenseCategory.INGREDIENTS, itemName: 'Базилик свежий, руккола и чеснок',
      description: 'Свежая зелень и овощи для кухни', amount: 360000,
      quantity: 12, unit: 'кг', unitPrice: 30000, invoiceNumber: `${cfg.code}-ING-1117`,
      spentAt: daysAgo(now, 1, 10), source: 'MANUAL', isVerified: true,
    });
  }

  await prisma.expense.createMany({ data: rows });

  const skipSet = new Set(cfg.skipExistingBudgets ?? []);
  const budgetRows: Array<{ id: string; restaurantId: string; category: ExpenseCategory; month: Date; limit: number }> = [
    { id: `seed-b-${c}-tax`, restaurantId: cfg.restaurantId, category: ExpenseCategory.TAXES, month: monthStart, limit: round5k(3800000) },
    { id: `seed-b-${c}-util`, restaurantId: cfg.restaurantId, category: ExpenseCategory.UTILITIES, month: monthStart, limit: round5k(2600000) },
    { id: `seed-b-${c}-comm`, restaurantId: cfg.restaurantId, category: ExpenseCategory.COMMUNICATION, month: monthStart, limit: round5k(650000) },
    { id: `seed-b-${c}-rent`, restaurantId: cfg.restaurantId, category: ExpenseCategory.RENT, month: monthStart, limit: round5k(2200000) },
    { id: `seed-b-${c}-sal`, restaurantId: cfg.restaurantId, category: ExpenseCategory.SALARY, month: monthStart, limit: round5k(3200000) },
    { id: `seed-b-${c}-ing`, restaurantId: cfg.restaurantId, category: ExpenseCategory.INGREDIENTS, month: monthStart, limit: round5k(6500000) },
    { id: `seed-b-${c}-pack`, restaurantId: cfg.restaurantId, category: ExpenseCategory.PACKAGING, month: monthStart, limit: round5k(800000) },
    { id: `seed-b-${c}-del`, restaurantId: cfg.restaurantId, category: ExpenseCategory.DELIVERY, month: monthStart, limit: round5k(1100000) },
    { id: `seed-b-${c}-eqp`, restaurantId: cfg.restaurantId, category: ExpenseCategory.EQUIPMENT, month: monthStart, limit: round5k(900000) },
    { id: `seed-b-${c}-mkt`, restaurantId: cfg.restaurantId, category: ExpenseCategory.MARKETING, month: monthStart, limit: round5k(950000) },
    { id: `seed-b-${c}-oth`, restaurantId: cfg.restaurantId, category: ExpenseCategory.OTHER, month: monthStart, limit: round5k(1100000) },
  ].filter(b => !skipSet.has(b.category) && !(cfg.restaurantId === 'rest-basilico' && (b.category === ExpenseCategory.MARKETING || b.category === ExpenseCategory.INGREDIENTS)));

  await prisma.expenseBudget.createMany({ data: budgetRows });
}
