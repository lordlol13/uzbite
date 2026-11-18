import 'dotenv/config';
import { MediaType, PrismaClient } from '@prisma/client';
import { seedBusinessAnalyticsForRestaurants } from '../apps/backend/src/services/demo-seed.js';

const prisma = new PrismaClient();
const photo = (id: number, width = 1200) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;

// Fictional demonstration catalog. These records do not represent partner restaurants.
// Media licensing and source credits are listed in docs/MEDIA_SOURCES.md.
const galleryRoot = '/images/uzbite/';
const galleries: Record<string, string[]> = {
  'rest-basilico': ['interior-chorsu.jpg', 'restaurant-cover.jpg', 'interior-tandir.jpg', 'interior-samarqand.jpg'],
  'rest-burger': ['interior-tandir.jpg', 'interior-chorsu.jpg', 'restaurant-cover.jpg'],
  'rest-mori': ['interior-samarqand.jpg', 'restaurant-cover.jpg', 'interior-chorsu.jpg'],
  'rest-non': ['interior-tandir.jpg', 'restaurant-cover.jpg', 'interior-samarqand.jpg'],
  'rest-osh': ['restaurant-cover.jpg', 'interior-chorsu.jpg', 'interior-tandir.jpg', 'interior-samarqand.jpg'],
  'rest-saffron': ['interior-samarqand.jpg', 'interior-chorsu.jpg', 'restaurant-cover.jpg'],
};
const restaurants = [
  {
    id: 'rest-osh', slug: 'osh-olov', name: 'Osh & Olov',
    description: 'Узбекская кухня, ароматный плов и блюда на огне. Демонстрационный ресторан UzBite.',
    addressText: 'Ташкент, улица Амира Темура, 12', latitude: 41.3112, longitude: 69.2797,
    cover: 1624487, deliveryFee: 12000, minOrder: 35000, isOpen: true,
    dishes: [
      { id: 'dish-plov', name: 'Чайханский плов', description: 'Рис лазер, говядина, жёлтая морковь и зира. Порция 350 г.', category: 'Узбекская кухня', price: 42000, costPrice: 18500, photo: 1624487 },
      { id: 'dish-samsa', name: 'Самса с говядиной', description: 'Слоёное тесто и сочная начинка, 2 штуки.', category: 'Выпечка', price: 26000, costPrice: 9500, photo: 2474658 },
      { id: 'dish-achichuk', name: 'Ачичук', description: 'Свежие помидоры, лук и острый перец.', category: 'Салаты', price: 18000, costPrice: 19500, photo: 1640777 },
    ],
  },
  {
    id: 'rest-basilico', slug: 'basilico', name: 'Basilico',
    description: 'Свежая паста, печная пицца и маленькие итальянские радости. Демонстрационный ресторан UzBite.',
    addressText: 'Ташкент, улица Шота Руставели, 24', latitude: 41.2885, longitude: 69.2567,
    cover: 1279330, deliveryFee: 10000, minOrder: 40000, isOpen: true,
    dishes: [
      { id: 'dish-pasta', name: 'Паста помодоро', description: 'Паста ручной работы, томаты, свежий базилик и пармезан.', category: 'Паста', price: 58000, costPrice: 19000, photo: 1279330 },
      { id: 'dish-pizza', name: 'Пицца Маргарита', description: 'Томаты, моцарелла и базилик, 30 см.', category: 'Пицца', price: 68000, costPrice: 24000, photo: 825661 },
      { id: 'dish-salad', name: 'Зелёный салат', description: 'Микс салатных листьев, овощи и лимонная заправка.', category: 'Салаты', price: 32000, costPrice: 11000, photo: 1640777 },
    ],
  },
  {
    id: 'rest-burger', slug: 'burger-bureau', name: 'Burger Bureau',
    description: 'Сочные бургеры, свежие булочки и хрустящий картофель. Демонстрационный ресторан UzBite.',
    addressText: 'Ташкент, улица Шахрисабз, 8', latitude: 41.3056, longitude: 69.2847,
    cover: 70497, deliveryFee: 9000, minOrder: 30000, isOpen: true,
    dishes: [
      { id: 'dish-burger', name: 'Бюро бургер', description: 'Говяжья котлета, чеддер, овощи и фирменный соус.', category: 'Бургеры', price: 49000, costPrice: 19500, photo: 70497 },
      { id: 'dish-fries', name: 'Картофель фри', description: 'Хрустящий золотистый картофель с морской солью.', category: 'Закуски', price: 19000, costPrice: 5500, photo: 1583884 },
      { id: 'dish-double', name: 'Двойной чизбургер', description: 'Две говяжьи котлеты, двойной чеддер и маринованные огурцы.', category: 'Бургеры', price: 69000, costPrice: 29000, photo: 1639557 },
    ],
  },
  {
    id: 'rest-non', slug: 'non-house', name: 'Non House',
    description: 'Свежая выпечка и неспешные завтраки каждый день. Демонстрационный ресторан UzBite.',
    addressText: 'Ташкент, улица Нукус, 16', latitude: 41.2948, longitude: 69.2814,
    cover: 376464, deliveryFee: 10000, minOrder: 25000, isOpen: true,
    dishes: [
      { id: 'dish-breakfast', name: 'Доброе утро', description: 'Тёплые панкейки, ягоды и мёд.', category: 'Завтраки', price: 39000, costPrice: 13000, photo: 376464 },
      { id: 'dish-croissant', name: 'Круассан', description: 'Воздушный круассан на сливочном масле.', category: 'Выпечка', price: 22000, costPrice: 7000, photo: 2135 },
      { id: 'dish-coffee', name: 'Капучино', description: 'Эспрессо и нежная молочная пена, 250 мл.', category: 'Напитки', price: 24000, costPrice: 6500, photo: 302899 },
    ],
  },
  {
    id: 'rest-mori', slug: 'mori', name: 'Mori',
    description: 'Паназиатская кухня, горячая лапша и свежие роллы. Демонстрационный ресторан UzBite.',
    addressText: 'Ташкент, улица Садыка Азимова, 20', latitude: 41.3096, longitude: 69.2926,
    cover: 357756, deliveryFee: 12000, minOrder: 45000, isOpen: true,
    dishes: [
      { id: 'dish-noodles', name: 'Лапша с овощами', description: 'Пшеничная лапша, сезонные овощи и соевый соус.', category: 'Лапша', price: 46000, costPrice: 16000, photo: 2347311 },
      { id: 'dish-roll', name: 'Ролл с лососем', description: 'Лосось, рис и сливочный сыр, 8 штук.', category: 'Роллы', price: 64000, costPrice: 28000, photo: 357756 },
      { id: 'dish-rice', name: 'Рис с овощами', description: 'Жасминовый рис, овощи и кунжут.', category: 'Горячее', price: 35000, costPrice: 11500, photo: 723198 },
    ],
  },
  {
    id: 'rest-saffron', slug: 'saffron', name: 'Saffron',
    description: 'Пряные блюда и уютные семейные ужины. Демонстрационный ресторан UzBite.',
    addressText: 'Ташкент, улица Махтумкули, 30', latitude: 41.3074, longitude: 69.3071,
    cover: 2474661, deliveryFee: 12000, minOrder: 35000, isOpen: false,
    dishes: [
      { id: 'dish-curry', name: 'Курица карри', description: 'Нежная курица в пряном сливочном соусе.', category: 'Горячее', price: 52000, costPrice: 20000, photo: 2474661 },
      { id: 'dish-biryani', name: 'Бирьяни', description: 'Рис басмати с пряностями и курицей.', category: 'Рис', price: 48000, costPrice: 18500, photo: 1624487 },
      { id: 'dish-tea', name: 'Чай с пряностями', description: 'Чёрный чай с молоком, кардамоном и корицей.', category: 'Напитки', price: 18000, costPrice: 4500, photo: 1417945 },
    ],
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEVELOPMENT_SEED !== 'true') {
    throw new Error('Development seed is disabled in production.');
  }

  const now = new Date();
  const feedOrder = ['rest-basilico', 'rest-mori', 'rest-osh', 'rest-burger', 'rest-non', 'rest-saffron'];
  const orderedRestaurants = [...restaurants].sort((a, b) => feedOrder.indexOf(a.id) - feedOrder.indexOf(b.id));
  for (const [index, entry] of orderedRestaurants.entries()) {
    const { dishes, cover, ...restaurant } = entry;
    const galleryUrls = (galleries[restaurant.id] ?? []).map(image => galleryRoot + image);
    await prisma.restaurant.upsert({
      where: { id: restaurant.id },
      create: { ...restaurant, logoUrl: photo(cover, 160), coverUrl: galleryUrls[0] ?? photo(cover), galleryUrls },
      update: { ...restaurant, logoUrl: photo(cover, 160), coverUrl: galleryUrls[0] ?? photo(cover), galleryUrls },
    });
    for (const [dishIndex, dish] of dishes.entries()) {
      const categoryId = `${restaurant.id}-category-${dish.category}`;
      await prisma.restaurantCategory.upsert({
        where: { id: categoryId },
        create: { id: categoryId, restaurantId: restaurant.id, name: dish.category, sortOrder: dishIndex },
        update: { name: dish.category },
      });
      await prisma.dish.upsert({
        where: { id: dish.id },
        create: { id: dish.id, restaurantId: restaurant.id, categoryId, name: dish.name, description: dish.description, price: dish.price, costPrice: dish.costPrice, imageUrl: photo(dish.photo), isAvailable: true },
        update: { name: dish.name, description: dish.description, price: dish.price, costPrice: dish.costPrice, imageUrl: photo(dish.photo), isAvailable: true },
      });
    }

    const postId = `post-${restaurant.id}`;
    const publishedAt = new Date(new Date('2026-11-08T08:00:00Z').getTime() - index * 60_000);
    const isPasta = restaurant.id === 'rest-basilico';
    const isNoodles = restaurant.id === 'rest-mori';
    const hasVideo = isPasta || isNoodles;
    const caption = hasVideo
      ? 'Искусство вкусной еды. Демонстрационный ролик из открытой медиатеки Pexels; не съёмка этого ресторана.'
      : `${dishes[0].name} — найдите своё новое любимое блюдо. Демонстрационная публикация со стоковой фотографией.`;
    await prisma.post.upsert({
      where: { id: postId },
      create: { id: postId, restaurantId: restaurant.id, dishId: dishes[0].id, caption, createdAt: publishedAt },
      update: { caption, createdAt: publishedAt },
    });
    const videoUrl = isPasta
      ? '/media/pasta-making-720p.mp4'
      : '/media/noodles-cooking-720p.mp4';
    await prisma.postMedia.upsert({
      where: { id: `media-${postId}` },
      create: {
        id: `media-${postId}`, postId,
        url: hasVideo ? videoUrl : photo(dishes[0].photo), posterUrl: photo(dishes[0].photo),
        type: hasVideo ? MediaType.VIDEO : MediaType.IMAGE,
        width: hasVideo ? (isPasta ? 720 : 1280) : 1200,
        height: hasVideo ? (isPasta ? 1280 : 720) : 800,
        duration: hasVideo ? (isPasta ? 13 : 28) : null,
        size: hasVideo ? (isPasta ? 3352517 : 10634587) : null,
      },
      update: {
        url: hasVideo ? videoUrl : photo(dishes[0].photo), posterUrl: photo(dishes[0].photo), type: hasVideo ? MediaType.VIDEO : MediaType.IMAGE,
        width: hasVideo ? (isPasta ? 720 : 1280) : 1200, height: hasVideo ? (isPasta ? 1280 : 720) : 800,
        duration: hasVideo ? (isPasta ? 13 : 28) : null, size: hasVideo ? (isPasta ? 3352517 : 10634587) : null,
      },
    });
  }

  await seedBusinessAnalyticsForRestaurants(prisma, now);

  console.info(`Seed completed: ${restaurants.length} fictional restaurants, ${restaurants.reduce((sum, restaurant) => sum + restaurant.dishes.length, 0)} dishes, plus multi-restaurant business analytics demo data (owner@uzbite.uz).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
