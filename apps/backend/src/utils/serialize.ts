import { Prisma } from '@prisma/client';

export function jsonValue(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, jsonValue(v)]));
  return value;
}
export const publicUserSelect = {
  id: true, email: true, name: true, username: true, usernameChangedAt: true,
  recipientName: true, bio: true, avatarUrl: true, phone: true, role: true, createdAt: true, settings: true,
} as const;
