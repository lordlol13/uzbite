# UzBite Restaurant Desktop (Windows `.exe`)

## 1. Назначение и архитектура

`apps/restaurant-desktop` — полноценное настольное Windows-приложение для аккаунта ресторана на платформе **UzBite**, построенное на:
- **Electron** (`electron/main.ts`, `electron/preload.ts`)
- **React 19 + TypeScript + Vite + Tailwind CSS v4**
- **React Router + TanStack Query + Socket.IO Client**
- **electron-builder** для упаковки в Windows x64 `.exe` (Portable и NSIS Installer)

Приложение подключается к единому серверу `@uzbite/backend` (`PORT=8081`), общей БД PostgreSQL и общему Socket.IO серверу — никаких локальных дубликатов заказов или отдельного backend внутри `.exe` нет.

### Форматы Windows `.exe` (обоснование)
Сборка генерирует два варианта для Windows x64 в `apps/restaurant-desktop/release/`:
1. **Portable `.exe`** (`UzBite-Restaurant-1.0.0-portable.exe`) — запуск в один клик без установки (удобно для быстрого тестирования на компьютере администратора ресторана).
2. **Установщик `.exe` (NSIS)** (`UzBite-Restaurant-1.0.0-setup.exe`) — классическая установка в систему с ярлыком на рабочем столе и меню «Пуск».

## 2. Безопасность Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Renderer не имеет прямого доступа к `fs`, `child_process` или Node.js API.
- Все взаимодействия идут через ограниченный `contextBridge` (`window.uzbiteRestaurant`) с проверкой `senderFrame` в `main.ts`.
- Токены сессии (`accessToken`, `refreshToken`) шифруются через Electron `safeStorage` и сохраняются в `userData/uzbite-restaurant-auth.bin`.
- Внешние ссылки блокируются через `setWindowOpenHandler` и `will-navigate`; для просмотра адреса покупателя на карте разрешён только валидированный IPC-переход на `https://yandex.ru/maps/...` или `https://yandex.uz/maps/...`.
- В упакованном `.exe` статический renderer (`dist/`) отдаётся встроенным loopback HTTP-сервером (`http://127.0.0.1:18083`, с fallback на свободный порт), благодаря чему корректно работают React Router и HTTP Referer для Yandex Maps JS API 3.0 без запущенного Vite dev-сервера.

## 3. Основные экраны и функции

- **Авторизация и регистрация (`RESTAURANT`)**: регистрация (`email`, `password`, `confirmPassword`), вход, ротация refresh-токена, экран настройки адреса сервера (`API Base URL`).
- **6-шаговый Onboarding**: информация и логотип, адрес и Yandex Maps 3.0, график работы, способы оплаты (наличные / перевод + QR), способы доставки (свои курьеры / заказные курьеры UzBite), предпросмотр.
- **Главная (Dashboard)**: реальные KPI из PostgreSQL, быстрые действия, переключение приёма заказов, последние заказы.
- **Заказы и карточка заказа**: 8 фильтров, состав заказа по историческим ценам, внешняя ссылка Яндекс Карт, подтверждение/отклонение оплаты картой и подтверждение наличных, назначение собственного или заказного курьера, отметка готовности и подтверждение передачи курьеру.
- **Меню и категории**: редактор блюд и категорий (неудаляемый системный фильтр «Все»), импорт/экспорт/шаблоны Excel (`.xlsx`) и CSV (`.csv`).
- **Видеопубликации**: загрузка видео (MP4/WebM) и обложек (9:16, 16:9, 4:3), черновики/публикация/скрытие, привязка к блюду из меню.
- **Мои курьеры и Доставка**: приглашение курьеров по email/username с обязательным согласием курьера, статусы доступности и загрузки, список доставок.
- **Статистика и Уведомления**: реальные расчёты с разделением созданных и оплаченных заказов, экспорт отчётов, Socket.IO + системные уведомления Windows.

## 4. Команды запуска и сборки

Из корня репозитория:

```bash
npm install
npm run dev:restaurant      # Vite dev-сервер (порт 8083)
npm run desktop:restaurant  # Сборка electron TS и запуск окна Electron в dev-режиме
npm run build:restaurant    # Production-сборка Electron и React renderer
npm run dist:restaurant     # Сборка Windows .exe (portable + setup) в apps/restaurant-desktop/release/
```
