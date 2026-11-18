import type { Notification, Prisma } from '@prisma/client';

type Language = 'ru' | 'uz' | 'en';
type Copy = Record<Language, string>;
const orderLabels: Record<string, Copy> = {
  PENDING_ACCEPTANCE: { ru: 'Ожидает принятия', uz: 'Qabul qilinishi kutilmoqda', en: 'Awaiting acceptance' },
  ACCEPTED: { ru: 'Заказ принят', uz: 'Buyurtma qabul qilindi', en: 'Order accepted' },
  PREPARING: { ru: 'Готовится', uz: 'Tayyorlanmoqda', en: 'Being prepared' },
  DELIVERING: { ru: 'Доставляется', uz: 'Yetkazilmoqda', en: 'Out for delivery' },
  DELIVERED: { ru: 'Доставлено', uz: 'Yetkazildi', en: 'Delivered' },
  CANCELLED: { ru: 'Отменено', uz: 'Bekor qilindi', en: 'Cancelled' },
};
const paymentLabels: Record<string, Copy> = {
  AWAITING_PAYMENT: { ru: 'Ожидает оплаты', uz: 'To‘lov kutilmoqda', en: 'Awaiting payment' },
  AWAITING_CONFIRMATION: { ru: 'Ожидает подтверждения', uz: 'Tasdiqlash kutilmoqda', en: 'Awaiting confirmation' },
  PAID: { ru: 'Оплачено', uz: 'To‘langan', en: 'Paid' },
  REJECTED: { ru: 'Оплата отклонена', uz: 'To‘lov rad etildi', en: 'Payment rejected' },
};
function metadata(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function text(value: Prisma.JsonValue | undefined) { return typeof value === 'string' ? value : ''; }
export function notificationDto(notification: Notification, preference: string | undefined = 'ru') {
  const language: Language = preference === 'uz' || preference === 'en' ? preference : 'ru';
  const data = metadata(notification.metadata);
  let restaurantName = text(data.restaurantName);
  let status = text(data.status);
  let authorName = text(data.authorName);
  // Older rows remain readable after the additive metadata migration.
  if (!restaurantName && notification.type === 'ORDER_CREATED') restaurantName = notification.body.replace(/ · ожидает принятия$/, '');
  if (!restaurantName && notification.type === 'ORDER_STATUS') {
    const match = /^(.*): (PENDING_ACCEPTANCE|ACCEPTED|PREPARING|DELIVERING|DELIVERED|CANCELLED)$/.exec(notification.body);
    restaurantName = match?.[1] ?? ''; status = status || match?.[2] || '';
  }
  if (!authorName && notification.type === 'COMMENT_REPLY') authorName = notification.body.replace(/ ответил на ваш комментарий$/, '');
  let title = notification.title, body = notification.body;
  if (notification.type === 'ORDER_CREATED') {
    title = ({ ru: 'Заказ создан', uz: 'Buyurtma yaratildi', en: 'Order placed' })[language];
    body = [restaurantName, orderLabels.PENDING_ACCEPTANCE![language]].filter(Boolean).join(' · ');
  } else if (notification.type === 'ORDER_STATUS') {
    title = ({ ru: 'Статус заказа обновлён', uz: 'Buyurtma holati yangilandi', en: 'Order status updated' })[language];
    body = [restaurantName, orderLabels[status]?.[language]].filter(Boolean).join(' · ') || title;
  } else if (notification.type === 'PAYMENT_STATUS') {
    title = ({ ru: 'Статус оплаты обновлён', uz: 'To‘lov holati yangilandi', en: 'Payment status updated' })[language];
    body = [restaurantName, paymentLabels[text(data.paymentStatus)]?.[language]].filter(Boolean).join(' · ') || title;
  } else if (notification.type === 'COMMENT_REPLY') {
    title = ({ ru: 'Новый ответ', uz: 'Yangi javob', en: 'New reply' })[language];
    body = language === 'ru' ? `${authorName} ответил на ваш комментарий` : language === 'uz' ? `${authorName} izohingizga javob berdi` : `${authorName} replied to your comment`;
  } else if (language !== 'ru') {
    title = ({ uz: 'UzBite bildirishnomasi', en: 'UzBite notification' })[language];
    body = ({ uz: 'Hisobingiz uchun yangi ma’lumot mavjud.', en: 'There is an update for your account.' })[language];
  }
  return { ...notification, title, body };
}
