# Конфигурация и модели

[Документация](README.md) · [Шаблон окружения](../.env.hackathon.example) · [Эксплуатация](hackathon-operations.md)

Все значения задаются в **локальном `.env` хакатонного checkout**. `pnpm hackathon:up` создаёт его из шаблона только при отсутствии и генерирует session secret. Уже существующий файл не заменяется. Ключи не поступают в браузер и не нужны при сборке образа. `LLM_*` личного продукта не являются fallback для Alfa.

## Окружение и хранение

| Поле                      | Шаблон / назначение                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `APP_VARIANT`             | `alfa`, защита от запуска личного окружения                                               |
| `APP_MODE`                | `demo` на свежем запуске; `live` включает реальные провайдеры без подмены ошибок fixtures |
| `COMPOSE_PROJECT_NAME`    | `context-alfa-hackathon`, изоляция volumes/сети                                           |
| `PUBLIC_APP_URL`          | `http://localhost:3010`, проверка Origin и параметры cookie                               |
| `DATABASE_URL`            | Host: `localhost:15433`; в Compose переопределяется на `postgres:5432`                    |
| `POSTGRES_PASSWORD`       | Локальный пароль БД; для внешнего размещения собственное значение                         |
| `REDIS_URL`               | Host: `localhost:16380`; в Compose — `redis:6379`                                         |
| `SESSION_SECRET`          | Случайная строка; шаблон заменяется загрузчиком                                           |
| `STORAGE_ROOT`            | Host: `.hackathon/files`; в Compose закрытый volume `/data/files`                         |
| `HACKATHON_DATA_ROOT`     | Host: `.hackathon`; в Compose bind `/case`, исходники `raw/` и OCR-кэш                    |
| `SMTP_HOST`, `SMTP_PORT`  | В Compose `mailpit:1025`; host-настройки шаблона не заменяют Compose. Web Mailpit — 8030  |
| `SMTP_FROM`               | Отправитель локальной демонстрационной почты                                              |
| `NEXT_TELEMETRY_DISABLED` | `1` в шаблоне                                                                             |

## Подключение организаторов

Ключ выдаётся команде организаторами. Основной endpoint — `https://changellenge.up.railway.app/v1`, запасной — `https://api.alfahack-gateway26.ru/v1`. Это значения из переданной инструкции, не адрес Gemini. В локальной live-приёмке выбран запасной; автоматического повторения неопределённого запроса через другой адрес нет.

| Поле                         | Значение / смысл                                                               |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `HACKATHON_LLM_API_KEY`      | Только командный ключ организаторов                                            |
| `HACKATHON_LLM_BASE_URL`     | Один из двух endpoint выше                                                     |
| `HACKATHON_EXTRACT_MODEL`    | `google/gemma-4-26b-a4b-it`                                                    |
| `HACKATHON_REASON_MODEL`     | `z-ai/glm-5.3-flash`                                                           |
| `HACKATHON_MODEL_REGISTRY`   | JSON `точный model ID → разрешённое семейство`; полный список в шаблоне        |
| `HACKATHON_REASONING_EFFORT` | `low` в шаблоне, также допустимы `high`/`max`; применяется к GLM               |
| `HACKATHON_OUTPUT_TOKENS`    | `4096` в шаблоне; допустимо 256–8192; учитывается в бюджете                    |
| `BRAVE_SEARCH_API_KEY`       | Отдельный ключ Brave Search; без него остаются RSS ЦБ и добавленные URL/тексты |

Пример маршрутизации; ключ следует добавить локально, значение в пример не включается:

```dotenv
APP_VARIANT=alfa
APP_MODE=live
HACKATHON_LLM_BASE_URL=https://api.alfahack-gateway26.ru/v1
HACKATHON_EXTRACT_MODEL=google/gemma-4-26b-a4b-it
HACKATHON_REASON_MODEL=z-ai/glm-5.3-flash
HACKATHON_MODEL_REGISTRY={"google/gemma-4-26b-a4b-it":"gemma-4-26b-a4b","z-ai/glm-5.3-flash":"glm-5.3-flash"}
HACKATHON_BILLING_MODE=gateway
HACKATHON_MODEL_PRICES={}
HACKATHON_REASONING_EFFORT=low
HACKATHON_OUTPUT_TOKENS=4096
```

Все шесть разрешённых моделей/IDs перечислены в [требованиях](hackathon-requirements.md#шесть-разрешённых-семейств). Неразрешённая модель блокируется до HTTP. Только две основные модели проверялись живыми вызовами; наличие остальных в registry не означает проведённую приёмку.

## Общий дневной бюджет

| Поле                          | Шаблон / правило                                                        |
| ----------------------------- | ----------------------------------------------------------------------- |
| `HACKATHON_BILLING_MODE`      | `gateway` в шаблоне; также `tariffs`. Default кода без поля — `tariffs` |
| `HACKATHON_MODEL_PRICES`      | `{}` в gateway; в tariffs обязательны подтверждённые цены               |
| `HACKATHON_BUDGET_RUB`        | `500`, можно уменьшить, увеличить выше 500 нельзя                       |
| `HACKATHON_BUDGET_TIMEZONE`   | `Europe/Moscow`                                                         |
| `HACKATHON_BUDGET_RESET_HOUR` | `3`, окно 03:00–03:00 МСК по инструкции организаторов                   |

**Gateway:** перед запросом `/key/info` с Authorization проверяет cap, остаток и окно. Advisory lock резервирует весь доступный остаток; вызовы приложения последовательны. Общий командный hard cap обеспечивает шлюз, включая расходы участников вне этой БД. Параметры окна в этом режиме должны соответствовать политике организаторов.

**Tariffs:** цены — десятичные строки `inputRubPerMillion` / `outputRubPerMillion` по каждому точному ID. Без подтверждённых цен запрос блокируется. Не подставляйте нули или тарифы другого провайдера.

Цена ответа в ₽ без тарифа — `null`. Usage, response-cost header и счётчик — отдельные свидетельства, не подтверждённая рублёвая цена. Неизвестный транспортный исход удерживает резерв; без доказательства его нельзя объявить бесплатным. [Подробный протокол](hackathon-gateway.md).

## Бюджет запуска и OCR

| Поле                        | Значение в шаблоне / ограничение                |
| --------------------------- | ----------------------------------------------- |
| `RUN_MAX_SEARCH`            | `6` поисковых запросов                          |
| `RUN_MAX_PAGES`             | `12` страниц                                    |
| `RUN_MAX_LLM`               | `12` вызовов, включая повторы/проверки          |
| `RUN_MAX_TOKENS`            | `60000`, вход и выход вместе                    |
| `RUN_MAX_MS`                | `600000` мс                                     |
| `HACKATHON_FILE_MAX_BYTES`  | Default кода `104857600` = 100 MiB, выше нельзя |
| `HACKATHON_BANK_MAX_PAGES`  | Default 200, допустимо 1–500                    |
| `HACKATHON_OCR_CONCURRENCY` | Default 2, допустимо 1–4                        |

Default-значения общего `config` могут отличаться от `.env.hackathon.example`: для воспроизводимого запуска используется именно шаблон. Лимиты не являются обещанием, что каждый запуск потратит весь объём. Новостей может быть рассмотрено меньше; пробелы отражаются в coverage.

После изменения окружения пересоздайте **только хакатонные** api/worker/web и перезапустите ingress по инструкции эксплуатации. Никогда не используйте `docker compose config` для публикации настроек: он может раскрыть секреты.
