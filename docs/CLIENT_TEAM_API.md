# Подключение клиентской части (для команды Customer Web / Mobile)

Этот репозиторий содержит **Desktop-модули (`apps/restaurant-desktop`, `apps/desktop`)** и **общий сервер + БД (`apps/backend`, `prisma`, `packages/shared`)**. Пользовательская клиентская витрина (`apps/frontend`) удалена, чтобы отдельная команда могла разрабатывать её независимо и подключаться к тому же серверу и PostgreSQL.

## 1. Базовые адреса и CORS

- **REST API**: `http://<SERVER_HOST>:8081/api` (или `https://api.example.com/api` в production)
- **Socket.IO**: `http://<SERVER_HOST>:8081` (или `https://api.example.com`)
- **Статические медиа каталога (seed + дефолтные фото/видео)**: `http://<SERVER_HOST>:8081/images/...` и `/media/...`
- **Загруженные рестораном медиа через Desktop**: `http://<SERVER_HOST>:8081/api/media/...` (или S3/CDN URL, если настроен S3)
- **Healthcheck**: `GET /api/health`

В `NODE_ENV=development` backend автоматически разрешает локальные и LAN-origin (`localhost:*`, `127.0.0.1:*`, `192.168.*`, `10.*`, `172.16-31.*`, `capacitor://localhost`, `ionic://localhost`). Для production укажите домен клиентского приложения в `ALLOWED_ORIGINS` в `.env`.

## 2. Авторизация покупателя (`role = USER`)

Поддерживаются оба варианта:

### Вариант A — Bearer-токены (рекомендуется для отдельного Web SPA, Vite/Next, React Native, Flutter)
Не требует проксирования cookie или CSRF-токена:
1. `POST /api/auth/token/register` `{ email, password, language?, theme? }` → `{ accessToken, refreshToken, expiresAt, user }`
2. `POST /api/auth/token/login` `{ email, password }` → `{ accessToken, refreshToken, expiresAt, user }`
3. `POST /api/auth/token/refresh` `{ refreshToken }` → `{ accessToken, refreshToken, expiresAt }`
4. `POST /api/auth/token/logout` `{ refreshToken? }` (c заголовком `Authorization: Bearer <accessToken>`)

Во всех запросах передавайте заголовок `Authorization: Bearer <accessToken>`.

### Вариант B — HttpOnly Cookies + CSRF (для веб-клиента с reverse proxy)
1. `GET /api/auth/csrf` → `{ csrfToken }`
2. `POST /api/auth/register` / `POST /api/auth/login` / `POST /api/auth/refresh` / `POST /api/auth/logout` (с заголовком `X-CSRF-Token` и `credentials: 'include'`).

## 3. Обмен данными между клиентской частью и Desktop ресторана

| Действие | Эндпоинт клиентской части | Что происходит в PostgreSQL и Desktop |
| --- | --- | --- |
| Каталог ресторанов и блюд | `GET /api/restaurants`, `GET /api/restaurants/:id`, `GET /api/categories` | Возвращает актуальные меню, категории и цены, созданные или обновлённые через `UzBite Restaurant.exe` (включая импорт Excel/CSV) |
| Видеолента | `GET /api/feed`, `POST/PUT/DELETE /api/posts/:id/like`, `/comments`, `PUT /api/restaurants/:id/follow` | Показывает только `PUBLISHED` публикации ресторана; черновики и скрытые ролики не отдаются |
| Расчёт корзины | `POST /api/orders/quote` | Сервер пересчитывает суммы из актуальных цен `Dish.price` и `deliveryFee` |
| Создание заказа | `POST /api/orders` | Создаёт `Order` (`PENDING_ACCEPTANCE`), `OrderItem`, `Payment`, уведомление ресторана и мгновенно шлёт `order:created` в `UzBite Restaurant.exe` через Socket.IO |
| Адреса и оценка доставки | `GET/POST/PATCH/DELETE /api/addresses`, `PATCH /api/profile/delivery-address` | Сохраняет координаты и пересчитывает время доставки по настройкам ресторана |
| Отслеживание заказа | `GET /api/orders?scope=active`, `GET /api/orders/:id` + Socket.IO `order:join` | Получает `order:updated`, `payment:updated` и `notification` при каждом действии ресторана/курьера. Живая GPS-позиция курьера не передаётся. |

## 4. Socket.IO подключение клиента

```ts
import { io } from 'socket.io-client';

const socket = io('http://<SERVER_HOST>:8081', {
  auth: { token: accessToken }, // или cookies с withCredentials: true
});

socket.emit('order:join', orderId, ack => {
  // ack = { ok: true }
});

socket.on('order:updated', order => { /* обновить статус заказа в UI */ });
socket.on('payment:updated', payload => { /* обновить статус оплаты */ });
socket.on('notification', notice => { /* локализованное уведомление */ });
```
