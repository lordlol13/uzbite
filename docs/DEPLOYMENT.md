# Перенос UzBite на Production-сервер

## 1. Разделение компонентов

1. **PostgreSQL** — отдельная управляемая БД в облаке (`DATABASE_URL`).
2. **Redis** — обязателен в production (`REDIS_URL`) для распределённого rate-limiting и pub/sub событий Socket.IO.
3. **S3-совместимое хранилище + CDN** (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `CDN_BASE_URL`) — в `NODE_ENV=production` локальная запись медиафайлов на диск отключена; все изображения, видео и чеки должны сохраняться в S3.
4. **Backend + Socket.IO** (`apps/backend`) — собирается через `npm run build -w @uzbite/backend` и запускается `npm run start -w @uzbite/backend` за HTTPS/WSS reverse proxy (Nginx / Caddy / ALB).
5. **Клиенты**:
   - Веб-фронтенд (`apps/frontend/dist`)
   - **UzBite Restaurant.exe** — пересборка `.exe` **не требуется** при переносе Backend в облако: в настройках приложения или через `UZBITE_API_BASE_URL` указывается `https://api.example.com`.

## 2. Обязательные настройки Production

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=8081
ALLOWED_ORIGINS=https://uzbite.example.com
ALLOW_DEVELOPMENT_SEED=false
```

- Сгенерируйте уникальные криптостойкие `JWT_SECRET` и `JWT_REFRESH_SECRET` (не менее 32 символов).
- Примените миграции Prisma на production БД: `npm run db:migrate`.
- Настройте регулярное резервное копирование PostgreSQL и мониторинг `/api/health`.
- Убедитесь, что в ключе Yandex Maps JS API 3.0 разрешены production-домены и домены приложения.
