# Приёмка и доказательства

[Документация](README.md) · [Матрица требований](hackathon-compliance.md) · [Методика качества](hackathon-evaluation.md)

**Состояние на 26.10.2026:** реализация, автономные проверки и функциональный live завершены на версии кода `3ee6c33`. Последующие изменения оформления репозитория не являются новой live-приёмкой. Полное независимое AI-соответствие не заявлено; финального тега нет.

## Последний опубликованный протокол · 25 октября

| Проверка             | Результат / доказательство                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                 | 82/82, контракты/источники/форматы/скоринг/провайдеры/бюджет                                                                             |
| Integration          | 30/30 на настоящих изолированных PostgreSQL/Redis: 12 корпоративных/провайдерских + 18 прежних                                           |
| Typecheck / lint     | Успешно                                                                                                                                  |
| Production build     | Next.js и Docker image с Tesseract rus+eng/Poppler успешно                                                                               |
| Live browser         | Три read-сценария на 1440/1024/390; отдельный GLM-чат через API/outbox/worker с отказом SSE и polling                                    |
| Реальная новость     | ЦБ от 23.10.2026; полный граф и приватный чат — succeeded; [модели/usage](hackathon-live-smoke.json)                                     |
| Банковские источники | Проверены точные фрагменты; последний live smoke явно не заявил подходящую текущую позицию банка; прежняя датированная ревизия сохранена |
| Бюджет               | Полный атомарный резерв/сериализация, cap, квитанция при отказе GET, output limit, потерянный ответ; `gateway-budget.test.ts`            |
| Качество             | Первый live P@5=0,70; v2-регрессия=0,80. Оба отчёта сохранены, независимая экспертиза pending                                            |
| Сохранность          | Равные stateHash до/после live-переключения, SHA 9 PDF; [протокол](hackathon-live-persistence.json)                                      |
| Изоляция             | main ref `1f2e1ae` и personal-теги сохранены; исходные файлы/index отдельного checkout не изменены данным этапом                         |
| Ключи                | Фактический organiser key не найден в tracked/новых неигнорируемых файлах; env/raw/локальные отчёты исключены из Git/build               |

Это исторические результаты, а не обещание текущей доступности локального сервера или шлюза. Проверка документации 26.10 не выполняет платные запросы.

## Автономная базовая приёмка · 24 октября

| Проверка              | Результат                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit / integration    | 79/79 и 28/28 до последующих gateway-проверок                                                                                              |
| Demo E2E              | 6/6 на production Edge, 1440×1000 / 1024×900 / 390×844                                                                                     |
| Пользовательские пути | Компания/ракурс/лента/источник/PDF, чат/отзыв, контекст, новая новость, SSE fallback, прямые ссылки/Back/reload, клавиатура/reduced motion |
| Полный CSV            | 85 525 variants, 85 514 company ID, 12 514 person links, 1 380 585 payments                                                                |
| Полный PDF            | 9 оригиналов / 64 страницы, 7 ready / 2 partial, аудит 12/12 точных цитат                                                                  |
| Чистый Compose        | `context-alfa-acceptance`, новые volumes, полный импорт, 2 desktop E2E; затем остановлен с сохранением данных                              |
| Миграция / restart    | 8 миграций, backfill immutable revisions; PG/Redis/API/worker/web restart, [равные checksum](hackathon-persistence.json)                   |
| Demo evaluation       | 40 development / 20 held-out, P@5 0,95 / 1,00; не качество живой LLM                                                                       |

## Наследованные защитные сценарии

Применимые проверки прежнего проекта сохранены в `tests/integration/workflows.test.ts`: CSRF/Origin и межорганизационный доступ, error/requestId, одноразовый email/reset, приглашения/последний owner, версии профиля, конкурентность/idempotency, приватность чата, удаление текста документа, cursor/partial/cancel/rescan, outbox/checkpoint/restart/repeated delivery/SSE, revisions и стабильная пагинация. Проверки прежних competitors/research также остаются, но эти экраны не являются основным сценарием Альфа-Бизнеса.

## Воспроизведение

<a id="reproduce"></a>

Из хакатонного checkout после установки зависимостей:

```sh
pnpm docs:check
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm hackathon:evaluate
pnpm build
docker compose -f compose.hackathon.yaml build api
```

`test:integration` создаёт отдельную БД, выполняет миграции и запускает worker, используя demo и локальный HTTP-стенд вместо командного ключа. Нужны доступные PostgreSQL/Redis и право создавать/удалять тестовую БД. `hackathon:evaluate` пересоздаёт demo JSON-отчёт; не путайте его с live-измерением.

**Demo E2E**, только против отдельного demo-контура:

```sh
E2E_BASE_URL=http://localhost:3010 PLAYWRIGHT_CHANNEL=msedge pnpm exec playwright test tests/e2e/bank.spec.ts
```

PowerShell:

```powershell
$env:E2E_BASE_URL='http://localhost:3010'
$env:PLAYWRIGHT_CHANNEL='msedge'
pnpm exec playwright test tests/e2e/bank.spec.ts
```

Нельзя запускать demo-сценарий с кнопкой «Открыть демонстрацию» против уже включённого live. Для live браузерный файл `bank-live.spec.ts` требует явных `E2E_LIVE_INSIGHT_PATH` и `E2E_TEST_PASSWORD` либо приватного `E2E_STORAGE_STATE`; файлы с сессиями не публикуются. Тест чата делает платный вызов; обычный suite без этих значений его пропускает. Повторные входы ограничены rate limit — используйте сохранённую собственную тестовую сессию, не отключайте контроль.

**Только явная платная live-проверка**, не часть запуска приложения:

```sh
pnpm exec tsx scripts/hackathon-live-smoke.ts --confirmed-live-smoke
pnpm exec tsx scripts/hackathon-live-check.ts --confirmed-paid-check
pnpm exec tsx scripts/hackathon-evaluate-live.ts --confirmed-paid-evaluation
```

Последний runner можно продолжить с `--resume=BATCH_UUID`: ранее завершённые случаи переиспользуются, неудачные попытки остаются в отчёте. Он останавливается при ошибке/лимите. Private reports — `.hackathon/reports`; перед публикацией готовится обезличенная сводка.

## Чего протокол не доказывает

Полноту внешнего поиска, корректность всех экономических гипотез, семантическую дедупликацию пересказов, промышленный SLA, restore drill на данных пользователя и независимую банковскую экспертизу. Механически верная цитата не равна обоснованной рекомендации. Финальные действия и остающиеся условия — в [комплекте сдачи](hackathon-release.md).
