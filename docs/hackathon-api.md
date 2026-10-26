# API корпоративной аналитики

[Документация](README.md) · [OpenAPI 3.1](openapi.alfa.json) · [Zod-контракты](../packages/contracts/src/corporate.ts) · [Роуты](../apps/api/src/corporate.ts)

Базовый префикс **`/api/v1/bank`**. Общие auth/jobs/health — в `/api/v1`. API работает через same-origin Nginx; браузер не обращается к PostgreSQL/LLM напрямую. OpenAPI доступен также по `GET /api/v1/openapi.json`.

## Основные маршруты

В таблице `:c` — разрешённая компания, `:i` — её инсайт, `:r` — её запуск.

| Метод и путь после `/bank`                 | Назначение / доступ                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /companies`, `/groups`                | Только разрешённые компании/участники групп                                               |
| `GET /companies/:c/context`                | Версионированный контекст и provenance                                                    |
| `PATCH /companies/:c/context`              | Явное подтверждение и expectedVersion, canEdit                                            |
| `GET /companies/:c/context/versions`       | История профиля                                                                           |
| `PATCH /companies/:c/preferences`          | Личный ракурс/интересы, не изменение grants                                               |
| `GET /companies/:c/feed`                   | Роль, интересы, days/category/industry, стабильный cursor                                 |
| `GET /companies/:c/insights/:i`            | Материал; параметр revision для сохранённой версии                                        |
| `GET /companies/:c/insights/:i/revisions`  | Неизменяемые версии оценки                                                                |
| `GET/POST /companies/:c/news`              | Список / импорт URL или текста; запись требует canEdit                                    |
| `POST /companies/:c/runs`                  | Асинхронный анализ, canEdit, expectedVersion, Idempotency-Key                             |
| `GET /companies/:c/runs`                   | История запусков без закрытого snapshot                                                   |
| `POST /companies/:c/runs/:r/cancel`        | Запрос отмены                                                                             |
| `GET /companies/:c/runs/:r/trace`          | Наблюдаемые этапы, версии, основания и usage                                              |
| `GET /companies/:c/evidence`               | Доступ к основанию после company/source checks                                            |
| `GET/POST /companies/:c/chats`             | Собственная приватная переписка / вопрос, Idempotency-Key                                 |
| `GET/POST /companies/:c/feedback`          | Отзывы, запрос экспертного разбора                                                        |
| `PATCH /companies/:c/feedback/:feedbackId` | Статус/экспертная заметка, admin-проверка                                                 |
| `GET /integration`                         | Режим, разрешённые модели, бюджет и моделируемые интеграции                               |
| `GET /imports`                             | Отчёты импорта, администратор                                                             |
| `GET /materials`                           | Общий корпус кейса, только участник с разрешённой компанией                               |
| `GET /materials/:materialId/pages/:page`   | Текст, OCR-координаты и качество страницы                                                 |
| `GET /materials/:materialId/original`      | Закрытый оригинал PDF                                                                     |
| `POST /materials/import`                   | PDF до 100 MiB, admin, multipart `file`, title/dateConfirmed/publishedAt; фоновое задание |

Точные query/body-схемы и HTTP-коды — в OpenAPI; таблица не заменяет контракт. В общем контуре сохранены auth, memberships, файлы, jobs и применимые маршруты личного продукта.

## Сессии и изменения

1. `GET /api/v1/auth/csrf` создаёт анонимную серверную сессию и возвращает csrfToken.
2. Login выполняется с cookie, `Origin` и `X-CSRF-Token`; после входа используются обновлённые cookie/token.
3. Изменяющие запросы обязаны передавать **Origin**, **X-CSRF-Token** и cookie. Длительные операции дополнительно передают **Idempotency-Key** (8–200 символов).
4. При сетевом повторе одной операции используйте тот же ключ и тот же payload. Иной payload с прежним ключом — конфликт.

Пример тела запуска; UUID/version должны быть прочитаны из текущего контекста:

```json
{
  "expectedVersion": 1,
  "perspective": "cfo",
  "search": false,
  "newsIds": []
}
```

`search=false` анализирует доступные сохранённые материалы без внешнего поиска. Для новой новости сначала POST `/news`, затем её ID в `newsIds`. По умолчанию период анализа — предыдущие 30 дней; from/to можно передать явно, будущий/перевёрнутый диапазон не принимается.

Ответ **202 JobAccepted** содержит `jobId`, `resourceId`, `status`, `reused`. Состояние задачи читается по `GET /api/v1/jobs/:jobId`; в корпоративном анализе не изменяется cursor личного news-анализатора.

## Ошибки и конкуренция

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Контекст обновился; перезагрузите страницу",
    "requestId": "request-identifier"
  }
}
```

`details` необязателен. Коды различают отсутствие доступа/версии/cursor, недоступный источник, неготовую конфигурацию, доступ к LLM, модель, квоту, timeout, несовместимую схему, неверный/обрезанный ответ. Клиент не должен повторять постоянную ошибку как временную.

Контекст PATCH требует `confirm=true` и актуальный expectedVersion. Ошибка 409 означает, что нужно перечитать контекст; автоматическая перезапись не выполняется. Публикация повторно проверяет grant, статус и версию в транзакции.

## Cursor и SSE

- Списки используют `items` / `nextCursor`, размеры и стабильный порядок заданы схемами. Cursor — непрозрачное значение; клиент не собирает его самостоятельно.
- Лента фильтрует доступные опубликованные ревизии **до LIMIT**, фиксирует asOf и сортирует устойчиво по score/date/ID. Ревизии и истории используют свои cursor-контракты.
- `GET /api/v1/jobs/:jobId/events` — SSE. Persisted event ID позволяет восстановление через `Last-Event-ID`; правом доступа проверяются запуск и связанная компания.
- SSE — основной канал активной задачи; при разрыве клиент включает polling и выключает его после завершения. Nginx не буферизует поток.

Генерация snapshot файла OpenAPI: `pnpm exec tsx scripts/hackathon-openapi.ts` из окружения `APP_VARIANT=alfa`. [Безопасность](hackathon-security.md).
