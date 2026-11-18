# Контракт API для будущего мобильного приложения Курьера (`UzBite Courier`)

Курьерское мобильное приложение будет разрабатываться на следующем этапе, но все серверные маршруты, проверки ролей, PostgreSQL-модели и Socket.IO события уже реализованы и покрыты интеграционными тестами.

> Важно: мобильный интерфейс курьера ещё не создан; поэтому физическое тестирование курьерского UI отложено до следующего этапа.

## 1. Авторизация (`Bearer JWT`)

- `POST /api/courier/auth/register` — `{ email, password, name, phone? }` → `{ accessToken, refreshToken, user }` (`role: "COURIER"`).
- `POST /api/courier/auth/login` — `{ email, password }` → `{ accessToken, refreshToken, user }`.
- `POST /api/courier/auth/refresh` — `{ refreshToken }` → ротация токенов.
- `POST /api/courier/auth/logout` — отзыв серверной сессии.
- `GET /api/courier/me` — текущий профиль курьера.
- `PATCH /api/courier/availability` — `{ availability: "AVAILABLE" | "BUSY" | "OFFLINE" | "UNAVAILABLE" }`.

## 2. Привязка к ресторану (Режим A)

- `GET /api/courier/affiliations` — список приглашений и активных ресторанов.
- `POST /api/courier/affiliations/accept` — `{ inviteCode }` или `{ affiliationId }` → переводит привязку в `ACTIVE`.

## 3. Предложения доставки и выполнение заказов

- `GET /api/courier/delivery-offers` — активные неистёкшие предложения (`PENDING`).
- `POST /api/courier/delivery-offers/:id/accept` — атомарное принятие предложения (возвращает `409 ALREADY_ASSIGNED`, если заказ уже забрал другой курьер).
- `POST /api/courier/delivery-offers/:id/reject` — `{ reason? }` — отказ от предложения.
- `GET /api/courier/deliveries` — список назначенных курьеру доставок.
- `PATCH /api/courier/deliveries/:id/status` — `{ status: "PICKED_UP" | "ON_THE_WAY" | "DELIVERED", note? }`.

## 4. Socket.IO комнаты и события для курьера

Подключение с `auth: { token: accessToken }`. Сервер автоматически добавляет сокет в `user:<courierId>`, `courier:<courierId>` и `couriers:available` (если статус `AVAILABLE`).

Входящие события для курьера:
- `delivery:offer_created` — `{ offerId, requestId?, deliveryId, orderId, mode, rewardAmount, expiresAt }`
- `delivery:pickup_ready` — `{ deliveryId, orderId }`
- `delivery:cancelled` — `{ deliveryId, orderId, reason }`
- `notification:created` — `{ type, title, body, link, metadata }`
