# Автономная приёмка кандидата

Дата: 24 октября 2026. Ветка `hackathon/alfa-2026`, база `main@1f2e1ae`. Режим `demo`; реквизитов организаторов нет. Финальная live-приёмка и релизный тег не выполнялись.

| Проверка | Фактический результат |
|---|---|
| `pnpm typecheck`, `pnpm lint` | Успешно |
| `pnpm test` | 79/79 unit |
| `pnpm test:integration` | 28/28: 10 корпоративных/провайдерских + 18 прежних защитных сценариев; настоящая изолированная PostgreSQL/Redis |
| `pnpm build` | Успешно, Next.js production / strict TypeScript |
| `docker compose -f compose.hackathon.yaml build api` | Успешно; production image включает локальный Tesseract rus+eng/Poppler |
| Production Playwright / Edge | 6/6 в финальном общем прогоне, 1440×1000 / 1024×900 / 390×844; новая ревизия по URL/reload также проверена |
| Браузерные действия | Компания/ракурс/лента/источник, PDF с `%PDF-`, приватный чат/отзыв, контекст, новая новость, отказ SSE, прямые ссылки, Back/Forward, keyboard, reduced motion, отсутствие horizontal overflow |
| Визуальная QA | Просмотрены production screenshots ленты/контекста desktop и ленты/инсайда mobile; исправлены tablet overflow, гонка перехода и артефакт скрытой skip-ссылки |
| Полный CSV | 85 525 company variants / 85 514 ID, 12 514 person links, 1 380 585 payment rows; SHA/COPY/reimport/Decimal/BigInt/conflict/unknown |
| Полный PDF | 9 оригиналов, 64 локально OCR-страницы, 7 ready / 2 partial; 12/12 retrieved quotes точно присутствуют на страницах. OCR-числа не объявлены ручным образом проверенными |
| Чистый Compose | `context-alfa-acceptance`: новые volumes, полный импорт и два desktop E2E. Порты 3011/15434/16381/8031; временный контур затем остановлен, volumes сохранены |
| Миграция существующих данных | 8 миграций; backfill старых CorporateInsight в неизменяемые ревизии, прежние данные сохранены |
| Persistence | После restart PG/Redis/API/worker/web/ingress идентичен `stateHash` профилей/grants/ревизий/чата/отзывов; все 9 PDF имеют исходные SHA. [Проверяемые агрегаты](hackathon-persistence.json) |
| Оценочный набор | 60 авторских синтетических сочетаний: 40 development / 20 held-out, все 7 ракурсов; P@5 0,95 / 1,0, references 100%, false bank attribution 0, paid calls 0 |
| Безопасность перед публикацией | `.env`, raw CSV/PDF, OCR-кэш, локальные отчёты и секреты исключены из Git/build context; найденные совпадения шаблона ключа в lockfile являются SHA-512 integrity hashes |
| Сохранность main | Git чист на `1f2e1ae44ec53b93162e2ba22198517c96474f35`; personal-v1/personal-v1.1 сохранены. Readiness localhost:3000: worker online, stalledRuns 0 |

Основной хакатонный контур работает на localhost:3010. Оригиналы находятся вне Git, в `.hackathon/raw` и закрытом files volume; сценарий жюри и тестовые аккаунты приведены отдельно.

## Что эти проверки не подтверждают

Это функциональная автономная приёмка. Семантическая обоснованность рекомендаций и качество извлечения живых Gemma/GLM не измерены. Авторская разметка не является независимой экспертизой банка; latency demo не включает сеть/LLM, нулевая стоимость не является тарифом. HTTP-стенд проверяет контракт шлюза, а не доступ к моделям организаторов.

До финального `alfa-hackathon-v1` нужны endpoint, точные model IDs, ключ, тарифы/правила суток; затем ограниченный live-прогон через общий ledger, фактические метрики, экспертная проверка атрибуции/рекомендаций и выполнение порогов кейса. Полнота внешнего поиска, семантическое объединение разных пересказов, промышленный нагрузочный SLA и restore drill на пользовательских данных не заявлены.
