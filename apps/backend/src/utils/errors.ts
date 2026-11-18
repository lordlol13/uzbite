import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function assert(condition: unknown, status: number, code: string, message: string): asserts condition {
  if (!condition) throw new ApiError(status, code, message);
}

export const notFound: RequestHandler = (_req, _res, next) =>
  next(new ApiError(404, 'NOT_FOUND', 'Страница API не найдена'));

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: 'Проверьте заполненные поля',
        fields: error.flatten().fieldErrors,
      },
    });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Запись уже существует' } });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Запись не найдена' } });
      return;
    }
    if (error.code === 'P2034') {
      res.status(409).json({ error: { code: 'RETRY', message: 'Данные изменились. Повторите действие' } });
      return;
    }
  }
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && ['P1001', 'P1002', 'P2024'].includes(error.code))
  ) {
    res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'База данных временно недоступна' } });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Некорректный запрос' } });
    return;
  }
  console.error('Unhandled API error:', error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Не удалось выполнить запрос. Попробуйте позже' } });
};
