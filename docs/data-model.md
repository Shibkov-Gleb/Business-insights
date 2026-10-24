# Модель данных

Prisma schema: `packages/db/prisma/schema.prisma`; PostgreSQL-specific индексы и FK находятся в миграциях. UUID используются для сущностей; даты — UTC timestamptz, отображение — timezone пользователя.

| Область | Сущности и инварианты |
|---|---|
| Доступ | User, Session, AuthToken, Membership, Invitation. Уникальный email и membership; invitation/reset/verification одноразовые. Owner нельзя понизить обычным редактированием. |
| Контекст | Organization, AnalysisScope, ProfileVersion, ProfileProposal. Один default scope; версии неизменяемы. Обновление требует expectedVersion. |
| Документы | Document, DocumentChunk. Закрытый storageKey; locators страницы/слайда/абзаца. Удаление оставляет tombstone без chunks. |
| Источники | SourceDocument — общедоступный кэш публикаций; приватных chunks здесь нет. Competitor хранит identity, revision, решение, наблюдение и основания. |
| События | Event — identity внутри scope; EventRevision — уникальный fingerprint существенных фактов и исходные source IDs. Перепечатки объединяются до оценки. |
| Анализ | InsightRun, Idempotency, Outbox, RunEvent. Один активный analysis на scope. Cursor принадлежит scope, сохраняет windowTo успешного принятого normal-run. |
| Инсайды | Insight хранит eventKey и указатель актуальной версии; InsightRevision — fingerprint фактов + profileVersionId, claims/evidence. ReadState индивидуален. |
| Чат | ChatThread private по умолчанию, ChatMessage, Decision. Один активный ответ в thread; share открывает весь thread только внутри scope. |
| Учёт | UsageRecord, AuditRecord, Feedback. Неизвестная стоимость null. Журналы без скрытых рассуждений и приватных текстов. |

FTS: GIN индексы russian, english, simple; pg_trgm для нестрогого поиска. Фрагменты до 2000 символов с overlap до 200, без потери структурного locator. Retrieval ограничен 12 фрагментами на шаг.

Общий профиль и scope override соединяются по полям: отсутствие override наследует, явное пустое значение заменяет. Факт содержит value, origin, assertion, дату и provenance; hypothesis остаётся гипотезой после подтверждения извлечения.

Состояния run: queued → running → succeeded / partial / failed; cancel_requested → cancelled. Failed, cancelled и partial не двигают cursor. Явное accept-partial допускается только для валидных предварительных результатов с допустимыми gaps и сохраняет аудит. Historical rescan никогда не двигает normal cursor.

Предложения конкурентов представлены состоянием `Competitor.decision=proposed` с собственными основаниями и revision. EvidenceRef хранится в JSON каждой неизменяемой InsightRevision; внешний excerpt сохраняется вместе с версией, чтобы изменение страницы не переписывало прежнее основание. Отдельные таблицы для этих двух вложенных DTO не нужны для их жизненного цикла.

## Рыночная разведка 1.1

`SourceSnapshot` неизменяем: canonical URL, текст, checksum, дата публикации/наблюдения, доступность. `RunSource` связывает его с run/org/scope и является границей доступа. Нельзя прочитать общий снимок по UUID без разрешённой связи. Старый EvidenceRef не требует snapshotId; новые ссылки могут содержать `sourceSnapshotId`, старые тексты и цитаты остаются без искусственного backfill.

`CompetitorWatchSource` хранит публичную страницу, категорию и version (не более 5 на конкурента). `CompetitorSnapshot` — факты и gaps одного исследования, уникален по run/competitor. `CompetitorChange` — поле, прежнее и новое утверждения с цитатами и обеими версиями. Первое наблюдение и пустой ответ изменений не создают; несколько противоречивых утверждений не превращаются в единственную «истину». Функции без оснований не считаются отсутствующими. Цена сохраняет amount/currency/period/unit/conditions.

Ручные сведения находятся отдельно в `Competitor.data.manualFacts`; CAS по revision возвращает 409 при конфликте. `ResearchBrief` уникален по run, хранит content и evidence, без сообщений приватных чатов. `Decision.briefId` уникален, threadId может быть null; запись появляется только после confirm=true. FK каскадно удаляют связи, досье и записки при удалении запуска/организации; осиротевший публичный snapshot не выдаётся API без RunSource.

Лента использует стабильную сортировку severity ASC, updatedAt DESC, id DESC и opaque cursor с параметрами фильтра. Условие успешной публикации проверяется SQL до LIMIT. Revisions/read-state загружаются двумя пакетными запросами; индексы feed_scope/feed_org и JSONB evidence поддерживают эти выборки.
