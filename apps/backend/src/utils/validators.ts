import { z } from 'zod';

export const phoneSchema = z.string().trim().regex(/^\+?[0-9\s()-]{7,22}$/).refine(value => {
  const digits = value.replace(/\D/g, ''); return digits.length >= 7 && digits.length <= 15;
}, 'Введите корректный номер телефона');
