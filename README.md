# UzBite Business — Аналитика и AI-аудит бизнеса

Платформа финансового контроллинга, юнит-экономики, бюджетирования и геоаналитики сети филиалов на базе **PostgreSQL + Prisma + Express + React/Electron + MCP**.

## Архитектура

```text
apps/desktop/           Electron + React + Vite UI («UzBite Business», порт 8082)
apps/backend/           Express 5 + Prisma REST API (/api/health, /api/business/*, порт 8081)
packages/shared/        Общие TypeScript-контракты, DTO и геометрия районов Ташкента
packages/finance-mcp/   Автономный MCP stdio-сервер финансовых и гео-инструментов
prisma/                 Схема PostgreSQL, SQL-миграции и seed демо-данных
scripts/                Локальный запуск PostgreSQL, .env и оркестрация стенда
tests/                  Интеграционные тесты UzBite Business API
docs/                   Документация AI-агента и деплоя
```

## Требования и установка

- Node.js 22.12+ (рекомендуется Node.js 24 LTS)
- npm 10+
- PostgreSQL 17/18 (в dev поддерживается встроенный `embedded-postgres` через `npm run db:local`)
- Redis (опционально в development; обязателен для rate-limit в production)

```bash
npm install
```

## Быстрый локальный запуск

```bash
npm run setup:local
npm run db:local
```

В другом терминале:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Либо запуск в один клик (Windows): [Start-UzBite-All.cmd](Start-UzBite-All.cmd) или `npm run start:all`.

- Backend API: `http://127.0.0.1:8081/api/health`
- UzBite Business UI: `http://127.0.0.1:8082`
- Демо-вход (только вне production): `owner@uzbite.uz` / `UzBiteBusiness2026!`

## Команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Локальный PostgreSQL + Backend API (8081) + UzBite Business UI (8082) |
| `npm run start:all` | Проверка окружения, БД, сборка и запуск Backend + Electron-окна UzBite Business |
| `npm run dev:server` | Локальный PostgreSQL + Backend API (8081) |
| `npm run dev:api` | Только Backend API (при уже запущенной БД) |
| `npm run dev:desktop` | Vite dev-сервер UzBite Business (8082) |
| `npm run desktop` | Запуск Electron-окна UzBite Business |
| `npm run build` | Production-сборка всех workspaces (`backend`, `desktop`, `shared`, `finance-mcp`) |
| `npm run typecheck` | Проверка TypeScript во всех workspaces |
| `npm run lint` | Проверка ESLint |
| `npm test` | Серверные модульные тесты финансовой аналитики и AI-агента |
| `npm run test:integration` | Интеграционные тесты `/api/health` и `/api/business/*` против PostgreSQL и API |
| `npm run db:generate` | Генерация Prisma Client |
| `npm run db:migrate` | Применение миграций Prisma |
| `npm run db:seed` | Заполнение демо-данных филиалов, заказов, расходов и бюджетов |

## Документация

- [docs/AI_AGENT.md](docs/AI_AGENT.md) — архитектура AI-контроллера, Points 24/25/26, геоаналитика и MCP
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — развёртывание на production-сервер
- [packages/finance-mcp/README.md](packages/finance-mcp/README.md) — подключение MCP-сервера `@uzbite/finance-mcp`
