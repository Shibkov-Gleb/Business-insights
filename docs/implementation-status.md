# Состояние реализации

Обновлено: 24 октября 2026. Проект «Контекст» реализован локально по 01-personal-project.md. Публикация и push не выполнялись.

## Реализованные этапы

1. pnpm workspace, strict TypeScript, три процесса, PostgreSQL/Redis/Mailpit, Nginx, миграции и volumes.
2. Argon2id, одноразовые email/reset-токены, серверные сессии, CSRF/Origin, роли, приглашения, ограничения scopes и передача владения.
3. Организации с тремя обязательными полями, wizard с обзором, направления, immutable profiles, overrides и подтверждение предложений с конфликтами версий.
4. PDF/PPTX/DOCX/TXT/MD, безопасный ZIP, locators, FTS/trigram, coverage, needs_ocr/partial, retry, tombstones и исключение удалённых источников.
5. Brave, RSS, HTTP page fetcher с DNS pinning, OpenAI-compatible HTTP, SMTP, конкуренты с основаниями и сохранением пользовательских решений.
6. Собственный LangGraph, план, retrieval, события/revisions, rubric, evidence validation, бюджеты, transactional outbox, PostgreSQL checkpoints, normal/rescan/cancel/accept-partial.
7. Private/shared chat, память разрешённых решений, read-state, рабочие статусы, обратная связь, история и SSE replay/polling.
8. Три demo-проекта, синтетические документы, противоречия и перепечатки, тесты, OpenAPI, эксплуатация и notices.

## Фактические проверки

| Проверка | Результат |
|---|---|
| pnpm typecheck | passed: API/packages и Next.js |
| pnpm lint | passed |
| pnpm test | 57 passed, 5 файлов; включая 9 format cases |
| pnpm test:integration | 15 passed; настоящие одноразовые PostgreSQL и Redis/BullMQ |
| pnpm build | passed; Webpack |
| Docker image build | passed; зафиксированные версии и frozen lockfile |
| Playwright | 6 passed: 1440x1000 и 390x844, Microsoft Edge |
| Evaluation | 16/16 размеченных пар; см. evaluation-report.md |
| Чистый Compose | Новые context-acceptance volumes; миграции и seed без ручной установки пакетов |
| Compose persistence | Все 5 файлов с совпавшими checksum, run, insight IDs и полный чат сохранились после restart и обновления контейнеров |
| Secret scan | Нет настроенных секретов и private runtime files среди исходников/fixtures |
| Live smoke | SKIP: LLM/Brave keys не настроены; платные вызовы не выполнялись |

Последний повтор браузерной приёмки собранного образа завершён: 6/6. Скриншоты desktop/mobile просмотрены; переполнений и перекрытий контента не обнаружено. Локальный тег personal-v1 создаётся после завершающего коммита с этими результатами.

## Соответствие сценариям приёмки

| № | Проверенное поведение | Свидетельство |
|---|---|---|
| 1 | Idea-stage, три поля, необязательные документы | unit contracts + browser registration/wizard |
| 2 | CSRF/Origin, email, login/logout, reset/revocation | integration auth + Mailpit browser flow |
| 3 | Одноразовые/истёкшие/отозванные приглашения, owner invariant, reader | integration membership |
| 4 | Чужая организация и закрытый scope, файлы, jobs/SSE, snippets и private chat | integration access/recovery/revisions |
| 5 | Пять форматов, locators, scanned PDF, ZIP bombs, deletion | format unit + Compose smoke + integration documents |
| 6 | Подтверждение proposals, 409, сохранение hypothesis | integration document/profile |
| 7 | Основания конкурентов, отказ не возникает снова, ручное редактирование | integration competitors + browser |
| 8 | 30-дневное начальное окно, cursor, windowTo=acceptedAt | integration runs + fixed-clock evaluation |
| 9 | Partial/cancel/rescan, явное принятие gaps, успешная пустая выдача | integration cursor + provider error unit |
| 10 | Конкурентные POST, outbox/checkpoint restart, повтор delivery, SSE replay | integration recovery; реальный restart worker |
| 11 | Релевантность, возможности, шум, неподтверждённая опасность | 16 labelled pairs + demo graph integration |
| 12 | Перепечатки, disputed, fingerprint/profile revisions, evidence | integration revisions + evaluation |
| 13 | Чат карточки/направления, private/share, reader | integration chat + browser |
| 14 | Prompt isolation, private IP, redirect, DNS rebinding, ZIP bounds | provider/network/format unit + access integration |
| 15 | Demo banner; live не подменяется fixtures при ошибках | browser + provider contracts; live smoke skipped |
| 16 | Desktop/mobile, источники, keyboard, ошибка API, потеря SSE | 6 Playwright scenarios |
| 17 | Чистые volumes, migration dependency, restart/persistence, internal DB/Redis | Compose smoke + проверка портов и demo seed guard |

## Границы проверенного результата

- Качество конкретной live LLM, полнота Brave/RSS и внешний SMTP требуют отдельного прогона с конфигурацией пользователя. Контрактный тест не подтверждает работу аккаунта провайдера.
- Demo evaluation проверяет детерминированную механику и references. Это не статистически доказанная точность и не аналитика реального рынка.
- OCR и понимание графиков/изображений не реализуются в v1. Архивный поиск не гарантирует полноту интернета; partial и gaps видны отдельно.
- Денежные оценки — decimal strings при заданных тарифах; без тарифа null. Потерянный внешний ответ при аварии может потребовать повторного платного вызова.
- Backup/restore инструкция подготовлена; restore drill на пользовательских данных не выполнялся. Проверена сохранность синтетических данных после restart.
- Turbopack и скачанный Chromium в этой Windows-среде давали subprocess/spawn ошибки. Использованы Webpack и установленный Edge; TLS verification не отключалась.
- Приложение остаётся локальным. Основной экземпляр: localhost:3000, Mailpit: localhost:8025. Приёмочные прогоны выполнялись отдельно на 3001/8026 (project context-acceptance); его volumes сохранены.
# Контекст 1.1 — ход реализации

Этап 1: добавлены контракты рыночной разведки, шесть сущностей, совместимое расширение evidence и миграция без удаления текущих данных. Снимки неизменяемы и доступны через связь с исследованием/направлением. Добавлены проверки цитат, базовой версии, изменений и конфликтующих сведений. Prisma Client сгенерирован. Миграция на работающей БД будет проверена в интеграционной приёмке.

Этап 2: собственный граф исследования с фиксированным планом, цитируемыми досье, baseline/diff, запиской и атомарным сохранением без изменения новостного cursor. Поиск конкурентов не ограничен свежестью. Классифицированы ошибки LLM, временные сбои повторяются максимум дважды; обычный 400 не отключает JSON Schema. 13 целевых unit-тестов прошли. Live-вызовы не выполнялись.

Этап 3: API и экраны досье, сравнения, обзора рынка, записок, экспорта и журнала решений. Контекст исследования учитывает все шесть стадий. Миграции проверены на новой БД; 16/16 интеграционных сценариев прошли, включая baseline → без изменений → новый тариф, ручное уточнение, права и неизменность новостного cursor. Исправлены обнаруженные проверкой конфликт имени узла LangGraph и heartbeat установленной версии BullMQ.

Этап 4: вынесены лента и отдельная страница инсайда, контекст/раздел/фильтры и досье сохраняются в URL. SSE обслуживает активные исследования, поиск конкурентов и чат; polling включается только при разрыве. Пагинация отбирает опубликованные доступные записи до LIMIT, revisions/read-state загружаются пакетно. Добавлены индексы ленты и JSONB-оснований, heartbeat и диагностика просроченных запусков. 17/17 интеграционных сценариев, 63/63 unit и typecheck/lint прошли; расширенная финальная приёмка продолжается.

Этап 5: единый журнальный дизайн обзора, досье, сравнения, входа, документов, чата и настроек. Палитра #0B0B0D / #EF3124 / #F4F1EB; для мелких действий — более тёмный #C5291D. Golos Text хранится локально с OFL-лицензией. Переходы 180–280 мс, последовательное появление материалов и reduced motion; источники открываются справа, мобильная таблица сохраняет свой продукт и переключает конкурента. Новый браузерный сценарий прошёл на 1440/1024/390 px, включая keyboard, history, reload, потерю SSE, экспорт и отсутствие горизонтального переполнения. Desktop/mobile скриншоты просмотрены; финальная визуальная проверка будет повторена на production.
