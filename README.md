# Контекст

Русскоязычное рабочее пространство, которое связывает новости с профилем бизнеса: идея → контекст → документы → конкуренты → обоснованные инсайды → обсуждение с агентом.

## Быстрый запуск через Docker

1. Скопируйте `.env.example` в `.env`.
2. Задайте `SESSION_SECRET` случайной строкой не короче 32 символов. Для генерации: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Не сохраняйте секрет в Git.
3. Выполните:

```sh
docker compose --profile demo up --build
```

Приложение: http://localhost:3000. Почта для подтверждения регистрации: http://localhost:8025. Миграции и идемпотентный demo seed выполняются до старта API. PostgreSQL, Redis и файлы сохраняются в отдельных named volumes.

**Демонстрационные аккаунты:** `founder@example.test` и `reader@example.test`, пароль `Context-demo-2026!`. Это исключительно синтетические аккаунты demo. Кнопка «Войти в demo» доступна только в этом режиме. Reader получает доступ к проекту после приглашения.

В demo поиск и LLM детерминированы; публикации вымышлены и помечены. Выводы demo не являются аналитикой реального рынка.

## Локальная разработка

Нужны Node 22.19.0+, pnpm 11.25.0, Docker Desktop. В `.env` для этого режима используются `localhost:5433`, `localhost:6380`, SMTP `localhost:1025`; Compose переопределяет внутренние адреса.

```sh
pnpm install --frozen-lockfile
docker compose -f compose.yaml -f compose.dev.yaml --profile demo up -d postgres redis mailpit
pnpm db:generate
pnpm db:migrate
pnpm db:seed:demo
pnpm dev
```

Три процесса: web на 3000, API на 4000, worker. Next.js проксирует `/api/v1` в API. Production Compose использует Nginx и внутреннюю сеть.

## Проверка сценария

1. Войдите в demo или зарегистрируйтесь и подтвердите email через Mailpit.
2. Создайте проект: достаточно названия, стадии и описания от 20 символов.
3. Загрузите файл из `tests/fixtures` и подтвердите предложение профиля в соответствующем направлении.
4. Найдите конкурентов и подтвердите полезного кандидата.
5. Запросите инсайды; откройте карточку, источник и обсуждение. В demo SaaS-профилю подходит проект «Линия».
6. Создайте приглашение reader, примите его вторым аккаунтом. Reader видит разрешённые инсайды и может вести чат, но не запускает анализ и не редактирует профиль.

## Проверки

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
pnpm exec tsx scripts/evaluate.ts
pnpm exec tsx scripts/live-smoke.ts
node scripts/secret-scan.mjs
```

Integration создаёт одноразовую БД `context_test_*`, запускает отдельный worker/очередь, затем удаляет только эту тестовую БД. Нужны PostgreSQL с правом CREATE DATABASE и Redis. E2E требует работающий demo-сервер и Mailpit; тестовые аккаунты помечены `e2e-*`. На этой Windows-машине тесты проверены через `PLAYWRIGHT_CHANNEL=msedge` (PowerShell: `$env:PLAYWRIGHT_CHANNEL='msedge'`). Установленный Chromium завершался ошибкой spawn; TLS-проверки не отключались.

## Live

Задайте `APP_MODE=live`, отдельное имя Compose-проекта, собственный пароль PostgreSQL, SMTP (`COMPOSE_SMTP_HOST` для контейнеров), `LLM_BASE_URL`, `LLM_MODEL_ID`, `LLM_API_KEY`, `BRAVE_SEARCH_API_KEY` и ограничения `RUN_MAX_*`/`CHAT_MAX_*`. Сервер возвращает явную ошибку, если интеграция не настроена. Demo не подставляется после ошибки live. Публичное размещение требует HTTPS и корректного `PUBLIC_APP_URL`.

Контрактные тесты проверяют формат HTTP и ошибки с подменённым внешним сервисом. Они **не подтверждают подключение к реальному LLM или Brave**. Реальные платные вызовы в ходе разработки не выполнялись.

`scripts/live-smoke.ts` пропускает проверку без ключей. При настроенных ключах выполняет ограниченный реальный запрос к LLM и Brave. `TOKEN_PRICE_INPUT/OUTPUT` — десятичные USD за миллион токенов; без тарифов стоимость отображается как неизвестная. Контекст модели проверяется консервативной оценкой по UTF-8 bytes, поэтому для больших профилей может потребоваться увеличение `LLM_CONTEXT_LIMIT` в пределах возможностей выбранной модели.

Браузерные тесты можно направить на другой экземпляр через `E2E_BASE_URL` и `E2E_MAIL_URL`. В этой рабочей сессии проверенный Compose-экземпляр использует порты 3001 и 8026, отдельный project `context-acceptance`. Для воспроизведения проверки сохранности: `node scripts/compose-smoke.mjs before`, restart сервисов этого project, затем `node scripts/compose-smoke.mjs after`. Только синтетические данные; проверочный manifest в `.cache`, без сессионных cookie.

## Документация

- `docs/architecture.md` — компоненты и границы доверия.
- `docs/data-model.md` — данные, версии и индексы.
- `docs/openapi.json` и `/api/v1/openapi.json` — API; генерация `pnpm exec tsx scripts/openapi.ts`.
- `docs/operations.md` — запуск, восстановление и эксплуатация.
- `docs/implementation-status.md` — фактические проверки и ограничения.
- `docs/evaluation-report.md` — 16 размеченных пар, grounding, дедупликация и latency demo.
- `THIRD_PARTY_NOTICES.md` — библиотеки, сервисы и модели.

Не входят в v1: расписание генерации новостей, платежи, банковские интеграции, обязательный OCR, автономные действия от имени компании. Проект не опубликован. Тег готовности создаётся только после выполнения всей приёмки.
