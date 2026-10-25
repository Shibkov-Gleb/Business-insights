# Запуск и эксплуатация

Требуются Node.js 22.19+, pnpm 11.25.0, Docker Compose и Linux Engine. Из worktree хакатонной ветки:

```sh
pnpm install --frozen-lockfile
pnpm hackathon:up
```

Команда создаёт отдельный `.env`, проверяет `APP_VARIANT=alfa`, получает оригиналы из manifest при их отсутствии, сверяет SHA, поднимает Compose, миграции, COPY/OCR и тестовые аккаунты. Запуск занимает несколько минут; OCR локальный, кэшируется по hash. При недоступности Google Drive поместите 12 оригиналов из папки кейса в `.hackathon/raw` и повторите команду. Ключи Gemini, личный `.env`, image и volumes `main` не копируются.

Приложение: http://localhost:3010; Mailpit: http://localhost:8030. PostgreSQL/Redis: loopback 15433/16380. Порт 3000 не затрагивается. Остановка: `docker compose -f compose.hackathon.yaml stop`. Не добавляйте `-v`: volumes содержат данные.

## Ключи организаторов

Адреса, IDs и правила расчётных суток получены от организаторов. Ключ помещается только в отдельный `.env` хакатонного worktree, поле `HACKATHON_LLM_API_KEY`. Поле `LLM_API_KEY` относится к личному продукту и автоматически не подхватывается. Заполните:

```dotenv
APP_VARIANT=alfa
APP_MODE=live
HACKATHON_LLM_BASE_URL=https://changellenge.up.railway.app/v1
HACKATHON_LLM_API_KEY=ORGANIZER_KEY
HACKATHON_EXTRACT_MODEL=google/gemma-4-26b-a4b-it
HACKATHON_REASON_MODEL=z-ai/glm-5.3-flash
HACKATHON_MODEL_REGISTRY={"google/gemma-4-26b-a4b-it":"gemma-4-26b-a4b","z-ai/glm-5.3-flash":"glm-5.3-flash"}
HACKATHON_MODEL_PRICES={}
HACKATHON_BILLING_MODE=gateway
HACKATHON_REASONING_EFFORT=low
HACKATHON_OUTPUT_TOKENS=4096
HACKATHON_BUDGET_RUB=500
HACKATHON_BUDGET_TIMEZONE=Europe/Moscow
HACKATHON_BUDGET_RESET_HOUR=3
BRAVE_SEARCH_API_KEY=SEPARATE_SEARCH_KEY_IF_NEEDED
```

Адреса и IDs получены от организаторов; ключ — placeholder. Режим `gateway` позволяет работать без таблицы тарифов: перед каждым вызовом `/key/info` с Authorization проверяет общий hard cap 500 и сброс в 03:00 МСК. На время вызова атомарно резервируется весь доступный остаток, поэтому платные вызовы приложения последовательны. Ответ и usage валидируются локально, заголовок `x-litellm-response-cost` и счётчик сохраняются как единицы шлюза; стоимость ответа в ₽ остаётся null. Тарифы и курс не выдумываются. В режиме `tariffs` по-прежнему обязательны подтверждённые input/output цены в ₽ за миллион.

Запасной адрес — `https://api.alfahack-gateway26.ru/v1`; он выбран в локальном окружении после нестабильности основного. Автоматического повтора через другой адрес нет: потерянный ответ может быть оплачен. Без Brave доступны добавленные новости и RSS ЦБ. После настройки: `docker compose -f compose.hackathon.yaml up -d --no-build --no-deps --force-recreate api worker web`, затем `docker compose -f compose.hackathon.yaml restart ingress`. Обновляйте образ перед переключением.

Лимит организаторов — 500 ₽ на ключ суммарно для всех участников команды и моделей, сброс в 03:00 МСК. Локальный ledger должен быть единым для всех worker этого приложения/ключа; перед вызовом он сверяется со счётчиком всех участников на шлюзе. Локальная БД не может резервировать средства за внешние приложения команды. Шлюз также применяет общий командный лимит. День ledger обозначает дату начала окна: до 03:00 это предыдущая дата. Не меняйте правило сброса после начала платных вызовов без сверки расходов. `Budget has been exceeded` считается постоянной квотной ошибкой и не повторяется. Неизвестный исход не освобождает резерв по таймауту. Для подтверждённого usage и известных тарифов (`HACKATHON_BILLING_MODE=tariffs`):

```sh
pnpm exec tsx scripts/hackathon-reconcile.ts RESERVATION_UUID INPUT_TOKENS OUTPUT_TOKENS --confirmed-gateway-usage
```

Команда не выполняет AI-запрос, пишет аудит. В gateway-режиме неизвестный транспортный исход удерживает резерв: не запускайте повтор, не сбрасывайте ledger вручную. Для сверки используются только Authorization-запросы и сохранённая граница бюджетного окна; без подтверждения списания дождитесь сброса. Ошибка чтения баланса после полного ответа не теряет его при наличии квитанции стоимости. Секреты и тексты документов в журналы не выводятся. Нулевая стоимость demo не является измерением цены моделей.

После проверки реквизитов можно явно запустить 20 отложенных сочетаний через штатную очередь и общий ledger:

```sh
pnpm exec tsx scripts/hackathon-evaluate-live.ts --confirmed-paid-evaluation
```

Это платный запуск, он не входит в `hackathon:up`. Используются отдельные синтетические профили, фактический банковский RAG и авторская разметка. При ошибке/лимите прогон останавливается; отчёт с моделями, usage, стоимостью и задержками сохраняется в `.hackathon/reports`, не в Git. В gateway-режиме costRub=null; gatewayCostUnits публикуется только при наличии квитанции каждого вызова. Семантические выводы и атрибуцию затем проверяет эксперт. Актуальные результаты — в `hackathon-gateway.md`.

## Диагностика и качество

`/api/v1/health/ready` проверяет БД/Redis, heartbeat и зависшие runs. «Исследования» показывает trace, ошибки, пробелы, затраты и стадии. При потере SSE включается polling; в простое история не опрашивается. Коды LLM различают доступ, модель, квоту, недоступность, timeout, схему и неверный ответ.

Еженедельный ручной процесс: проверить зависшие/неуспешные runs, неизвестные резервы, отсутствие банковской позиции, ошибки цитат, отзывы wrong_bank/wrong_evidence и контрольный набор. Банковский эксперт проверяет спорные атрибуции/причинную цепочку, отмечает результат в «Экспертном разборе». Перед сменой модели повторить held-out/контрфактические проверки, сохранить model IDs, версии, usage, стоимость и latency. Автоматических платных исследований нет.

## Backup / restore

Сохраняйте БД, files volume, `.hackathon/raw`, OCR-кэш и конфигурацию отдельно; оригиналы/секреты не помещайте в Git:

```sh
docker compose -f compose.hackathon.yaml exec -T postgres pg_dump -U context -d context -Fc -f /tmp/alfa.dump
docker compose -f compose.hackathon.yaml cp postgres:/tmp/alfa.dump .hackathon/alfa.dump
```

Volumes: `context-alfa-hackathon_alfa-files`, `context-alfa-hackathon_alfa-database`, `context-alfa-hackathon_alfa-redis`. Перед restore остановить API/worker, восстановить dump в отдельную пустую БД, files по тем же UUID, сверить SHA/количества/права, выполнить миграции/readiness. Не восстанавливать поверх `main`. Redis восстанавливается из AOF; при потере очереди outbox/recovery возвращает незавершённые задачи из PostgreSQL.

OCR: Poppler 22.12.0-2+deb12u3, Tesseract 5.3.0-2, rus/eng 1:4.1.0-2. Прямые native-зависимости закреплены в Dockerfile, npm-дерево — в pnpm-lock.yaml.

Для проверки сохранности до и после restart выполните внутри контейнера `pnpm exec tsx scripts/hackathon-state.ts`. Команда только читает: сверяет hash всех оригиналов PDF и выдаёт агрегаты/контрольную сумму профилей, grants, ревизий, чатов и отзывов без содержимого клиентских записей. При отсутствии активных исследований `stateHash` должен совпасть.
