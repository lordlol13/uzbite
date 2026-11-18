import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { assert } from '../utils/errors.js';
import { deliveryAddressForUser } from '../services/delivery.js';

const addressFields = {
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  addressText: z.string().trim().min(5).max(500), label: z.string().trim().min(1).max(80),
  entrance: z.string().trim().max(30), floor: z.string().trim().max(20),
  apartment: z.string().trim().max(30), comment: z.string().trim().max(500),
  isDefault: z.boolean(),
};
export const addressSchema = z.object({
  ...addressFields, label: addressFields.label.default('Дом'), entrance: addressFields.entrance.default(''),
  floor: addressFields.floor.default(''), apartment: addressFields.apartment.default(''),
  comment: addressFields.comment.default(''), isDefault: addressFields.isDefault.default(false),
}).strict();
export const addressPatchSchema = z.object(addressFields).partial().strict();
export const addressRouter = Router();
addressRouter.use(requireAuth);
addressRouter.get('/delivery', async (req, res) => { res.json({ data: await deliveryAddressForUser(req.user!.id) }); });
addressRouter.put('/delivery', async (req, res) => {
  const { addressId } = z.object({ addressId: z.string().min(1).max(100) }).strict().parse(req.body);
  const userId = req.user!.id;
  const address = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const owned = await tx.userAddress.findFirst({ where: { id: addressId, userId } });
    assert(owned, 404, 'NOT_FOUND', 'Адрес не найден');
    await tx.user.update({ where: { id: userId }, data: { deliveryAddressId: owned.id } });
    return owned;
  });
  res.json({ data: { address, source: 'selected' } });
});
addressRouter.get('/', async (req, res) => {
  const items = await db.userAddress.findMany({ where: { userId: req.user!.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  res.json({ data: items });
});
addressRouter.post('/', async (req, res) => {
  const input = addressSchema.parse(req.body);
  const userId = req.user!.id;
  const address = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const count = await tx.userAddress.count({ where: { userId } });
    assert(count < 20, 400, 'ADDRESS_LIMIT', 'Можно сохранить не больше 20 адресов');
    const isDefault = input.isDefault || count === 0;
    if (isDefault) await tx.userAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    const address = await tx.userAddress.create({ data: { ...input, userId, isDefault } });
    if (input.isDefault) await tx.user.update({ where: { id: userId }, data: { deliveryAddressId: address.id } });
    return address;
  });
  res.status(201).json({ data: address });
});
addressRouter.patch('/:id', async (req, res) => {
  const input = addressPatchSchema.parse(req.body);
  const userId = req.user!.id;
  const address = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const existing = await tx.userAddress.findFirst({ where: { id: req.params.id as string, userId } });
    assert(existing, 404, 'NOT_FOUND', 'Адрес не найден');
    if (input.isDefault) await tx.userAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    if (input.isDefault === false && existing.isDefault) {
      const other = await tx.userAddress.findFirst({ where: { userId, id: { not: existing.id } } });
      if (other) { await tx.userAddress.update({ where: { id: existing.id }, data: { isDefault: false } }); await tx.userAddress.update({ where: { id: other.id }, data: { isDefault: true } }); }
      else input.isDefault = true;
    }
    const address = await tx.userAddress.update({ where: { id: existing.id }, data: input });
    if (input.isDefault) await tx.user.update({ where: { id: userId }, data: { deliveryAddressId: address.id } });
    return address;
  });
  res.json({ data: address });
});
addressRouter.delete('/:id', async (req, res) => {
  const userId = req.user!.id;
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const existing = await tx.userAddress.findFirst({ where: { id: req.params.id as string, userId } });
    assert(existing, 404, 'NOT_FOUND', 'Адрес не найден');
    await tx.userAddress.delete({ where: { id: existing.id } });
    if (existing.isDefault) { const next = await tx.userAddress.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } }); if (next) await tx.userAddress.update({ where: { id: next.id }, data: { isDefault: true } }); }
  });
  res.json({ data: { deleted: true } });
});
