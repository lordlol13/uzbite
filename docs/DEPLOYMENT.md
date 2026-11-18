# Развёртывание UzBite Business на Production-сервер

## 1. Компоненты платформы

1. **PostgreSQL** — управляемая БД (`DATABASE_URL`).
2. **Redis** — обязателен в production (`REDIS_URL`) для распределённого rate-limiting и кэширования AI-отчётов.
3. **Backend API (`apps/backend`)** — собирается через `npm run build -w @uzbite/backend` и запускается `npm run start -w @uzbite/backend` за HTTPS reverse proxy (Nginx / Caddy / ALB).
4. **Desktop / Web UI (`apps/desktop`)** — собирается через `npm run build -w @uzbite/desktop` (`apps/desktop/dist`) и может запускаться в Electron (`UZBITE_API_BASE_URL` / `BUSINESS_API_URL`) или раздаваться как SPA за reverse proxy с проксированием `/api` на Backend.
5. **MCP-сервер (`packages/finance-mcp`)** — собирается через `npm run build -w @uzbite/finance-mcp` (`packages/finance-mcp/dist/index.js`).

## 2. Обязательные настройки Production

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=8081
ALLOWED_ORIGINS=https://business.example.com
ALLOW_DEVELOPMENT_SEED=false
```

- Сгенерируйте уникальные криптостойкие `JWT_SECRET` и `JWT_REFRESH_SECRET` (не менее 32 символов).
- Примените миграции Prisma на production БД: `npm run db:migrate`.
- Настройте резервное копирование PostgreSQL и мониторинг `GET /api/health`.
