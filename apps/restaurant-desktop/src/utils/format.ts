import type { DeliveryMode, DeliveryStatus, Language, OrderStatus, PaymentStatus } from '@uzbite/shared';

export function formatMoney(amount: number | string, lang: Language = 'ru'): string {
  const num = Number(amount) || 0;
  const formatted = new Intl.NumberFormat(
    lang === 'uz' ? 'uz-UZ' : lang === 'en' ? 'en-US' : 'ru-RU',
    { maximumFractionDigits: 2 },
  ).format(num);
  return `${formatted} сум`;
}

export function formatCompactMoney(amount: number | string, lang: Language = 'ru'): string {
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    const suffix = lang === 'en' ? 'B' : lang === 'uz' ? 'mlrd' : 'млрд';
    return `${sign}${(abs / 1_000_000_000).toFixed(1)} ${suffix}`;
  }
  if (abs >= 1_000_000) {
    const suffix = lang === 'en' ? 'M' : lang === 'uz' ? 'mln' : 'млн';
    return `${sign}${(abs / 1_000_000).toFixed(1)} ${suffix}`;
  }
  if (abs >= 1_000) {
    const suffix = lang === 'en' ? 'K' : lang === 'uz' ? 'ming' : 'тыс';
    return `${sign}${(abs / 1_000).toFixed(0)} ${suffix}`;
  }
  return `${Math.round(num)}`;
}

export function formatDateTime(iso: string, lang: Language = 'ru'): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'uz' ? 'uz-UZ' : lang === 'en' ? 'en-US' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function orderStatusInfo(status: OrderStatus): {
  label: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
} {
  switch (status) {
    case 'PENDING_ACCEPTANCE':
      return { label: 'Ожидание принятия', tone: 'warn' };
    case 'ACCEPTED':
      return { label: 'Принят', tone: 'accent' };
    case 'PREPARING':
      return { label: 'Готовится', tone: 'accent' };
    case 'DELIVERING':
      return { label: 'Доставляется', tone: 'good' };
    case 'DELIVERED':
      return { label: 'Доставлено', tone: 'good' };
    case 'CANCELLED':
      return { label: 'Отменено', tone: 'bad' };
  }
}

export function paymentStatusInfo(status: PaymentStatus): {
  label: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
} {
  switch (status) {
    case 'AWAITING_PAYMENT':
      return { label: 'Ожидает оплаты', tone: 'neutral' };
    case 'AWAITING_CONFIRMATION':
      return { label: 'Ожидает подтверждения', tone: 'warn' };
    case 'PAID':
      return { label: 'Оплачено', tone: 'good' };
    case 'REJECTED':
      return { label: 'Оплата отклонена', tone: 'bad' };
  }
}

export function deliveryStatusInfo(status: DeliveryStatus): {
  label: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
} {
  switch (status) {
    case 'NOT_REQUESTED':
      return { label: 'Не выбрана', tone: 'neutral' };
    case 'SEARCHING':
      return { label: 'Ищем курьера…', tone: 'warn' };
    case 'OFFERED':
      return { label: 'Ожидание ответа курьера', tone: 'warn' };
    case 'ASSIGNED':
    case 'COURIER_ACCEPTED':
      return { label: 'Курьер найден', tone: 'accent' };
    case 'READY_FOR_PICKUP':
      return { label: 'Готов к выдаче', tone: 'accent' };
    case 'PICKED_UP':
      return { label: 'Передан курьеру', tone: 'good' };
    case 'ON_THE_WAY':
      return { label: 'В пути к покупателю', tone: 'good' };
    case 'DELIVERED':
      return { label: 'Доставлен', tone: 'good' };
    case 'FAILED':
      return { label: 'Курьер не найден', tone: 'bad' };
    case 'CANCELLED':
      return { label: 'Доставка отменена', tone: 'bad' };
  }
}

export function deliveryModeLabel(mode: DeliveryMode): string {
  return mode === 'OWN_COURIER' ? 'Свой курьер' : 'Заказной курьер UzBite';
}

export function resolveMediaUrl(url: string | null | undefined, apiBaseUrl: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${apiBaseUrl.replace(/\/$/, '')}${url}`;
  }
  return url;
}
