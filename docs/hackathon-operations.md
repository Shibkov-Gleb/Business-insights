# Запуск и эксплуатация

Требуются Node.js 22.19+, pnpm 11.25.0, Docker Compose и Linux Engine. Из worktree хакатонной ветки:

```sh
pnpm install --frozen-lockfile
pnpm hackathon:up
```

Команда создаёт отдельный `.env`, проверяет `APP_VARIANT=alfa`, получает оригиналы из manifest при их отсутствии, сверяет SHA, поднимает Compose, миграции, COPY/OCR и тестовые аккаунты. Запуск занимает несколько минут; OCR локальный, кэшируется по hash. При недоступности Google Drive поместите 12 оригиналов из папки кейса в `.hackathon/raw` и повторите команду. Ключи Gemini, личный `.env`, image и volumes `main` не копируются.

Приложение: http://localhost:3010; Mailpit: http://localhost:8030. PostgreSQL/Redis: loopback 15433/16380. Порт 3000 не затрагивается. Остановка: `docker compose -f compose.hackathon.yaml stop`. Не добавляйте `-v`: volumes содержат данные.

## Ключи организаторов

После получения endpoint, точных IDs, ключа, тарифов и правил расчётных суток заполните отдельный `.env`:

```dotenv
APP_VARIANT=alfa
APP_MODE=live
HACKATHON_LLM_BASE_URL=https://ORGANIZER-GATEWAY/v1
HACKATHON_LLM_API_KEY=ORGANIZER_KEY
HACKATHON_EXTRACT_MODEL=EXACT_GEMMA_ID
HACKATHON_REASON_MODEL=EXACT_GLM_ID
HACKATHON_MODEL_REGISTRY={"EXACT_GEMMA_ID":"gemma-4-26b-a4b","EXACT_GLM_ID":"glm-5.3-flash"}
HACKATHON_MODEL_PRICES={"EXACT_GEMMA_ID":{"inputRubPerMillion":"ACTUAL_PRICE","outputRubPerMillion":"ACTUAL_PRICE"},"EXACT_GLM_ID":{"inputRubPerMillion":"ACTUAL_PRICE","outputRubPerMillion":"ACTUAL_PRICE"}}
HACKATHON_BUDGET_RUB=500
HACKATHON_BUDGET_TIMEZONE=Europe/Moscow
BRAVE_SEARCH_API_KEY=SEPARATE_SEARCH_KEY_IF_NEEDED
```

Это placeholders, не реквизиты сервиса. Цены — десятичные строки ₽ за миллион токенов; неизвестные блокируют вызовы. Без Brave доступны добавленные новости и RSS ЦБ. Допустимые семейства перечислены в конфигурации; неявного fallback нет, личные `LLM_*` не применяются. После изменения: `docker compose -f compose.hackathon.yaml up -d --force-recreate api worker web`. Проверить настройки и выполнить ограниченную live-приёмку с контролем ledger.

Ledger должен быть единственным для ключа. Не запускайте тот же платный ключ в независимых БД. День резервирования считается по timezone; правила биллинга и переход через полночь подтвердить до live-приёмки. Неизвестный исход не освобождает резерв по таймауту. Для подтверждённого usage шлюза:

```sh
pnpm exec tsx scripts/hackathon-reconcile.ts RESERVATION_UUID INPUT_TOKENS OUTPUT_TOKENS --confirmed-gateway-usage
```

Команда не выполняет AI-запрос, пишет аудит. Секреты и тексты документов в журналы не выводятся. Нулевая стоимость demo не является измерением цены моделей.

После проверки реквизитов можно явно запустить 20 отложенных сочетаний через штатную очередь и общий ledger:

```sh
pnpm exec tsx scripts/hackathon-evaluate-live.ts --confirmed-paid-evaluation
```

Это платный запуск, он не входит в `hackathon:up`. Используются отдельные синтетические профили, фактический банковский RAG и авторская разметка. При ошибке/лимите прогон останавливается; отчёт с моделями, usage, стоимостью и задержками сохраняется в `.hackathon/reports`, не в Git. Семантические выводы и атрибуцию затем проверяет эксперт. На текущей версии этот прогон не выполнялся: реквизитов организаторов нет.

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
