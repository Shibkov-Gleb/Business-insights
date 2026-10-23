# Эксплуатация

Demo и live запускайте отдельными Compose project names и volumes. Имя по умолчанию `context-${APP_MODE}`. Queue namespace включает режим и hash имени БД. Для одинаковых имён БД в разных инстансах используйте отдельный Redis, как в стандартном Compose.

`docker compose --profile demo up --build` ждёт PostgreSQL health и migration job. Live не вызывает demo seed. Redis использует AOF. API, Redis и PostgreSQL не имеют опубликованных портов в основном Compose; `compose.dev.yaml` открывает БД/Redis только на loopback. Mailpit доступен только demo/development profile.

Секреты — через `.env` или secret manager платформы. Для live задайте уникальные SESSION_SECRET/POSTGRES_PASSWORD, внешний SMTP, LLM model/base URL/key и Brave key. Не используйте `context_local_only` для реального размещения. Настройте HTTPS перед ingress и PUBLIC_APP_URL; сессионная cookie должна быть Secure. Не включайте external tracing без отдельного решения о передаче данных.

## Backup и restore

Остановите новые запросы и worker, дождитесь завершения активной транзакции. Сделайте согласованную копию PostgreSQL и file volume одного момента. Пример для собственного окружения:

```sh
docker compose stop api worker
docker compose exec -T postgres pg_dump -U context -Fc context > context.dump
docker run --rm -v context-demo_files:/data:ro -v "$PWD/backups:/backup" debian:bookworm-slim tar czf /backup/files.tar.gz -C /data .
docker compose start api worker
```

Храните дамп и архив вне Git с ограниченным доступом и шифрованием. Для восстановления используйте отдельный project/volumes, восстановите БД через pg_restore и файлы в соответствующий volume; затем примените миграции и запустите API/worker. Не восстанавливайте поверх действующего live без проверки и резервной копии.

Пример восстановления в **новый пустой** project `context-restore` (файлы backup доверенные):

```sh
docker compose -p context-restore up -d postgres redis
docker cp backups/context.dump context-restore-postgres-1:/tmp/context.dump
docker compose -p context-restore exec -T postgres pg_restore -U context -d context --no-owner /tmp/context.dump
docker run --rm -v context-restore_files:/data -v "$PWD/backups:/backup:ro" debian:bookworm-slim tar xzf /backup/files.tar.gz -C /data
docker compose -p context-restore run --rm migrate
```

После проверки восстановленных данных запускайте остальные сервисы с отдельным APP_PORT и правильным PUBLIC_APP_URL. Restore drill на пользовательских данных не выполнялся; проверялась сохранность синтетических файлов и истории после restart и обновления контейнеров.

## Восстановление заданий

Worker обрабатывает SIGTERM: прекращает диспетчеризацию и ждёт активные задания. PostgreSQL outbox и checkpoints позволяют восстановить доставку после restart. Redis не является единственным источником статуса. Если внешний вызов был оплачен, но ответ потерялся, повтор может повторно вызвать сервис; ограничения токенов и операций не являются гарантией exactly-once оплаты.

Ограничения по умолчанию: анализ — 12 search, 40 страниц, 16 LLM, 60000 токенов и 10 минут; чат — 4 LLM, 4 search, 15000 токенов. Стоимость без заданного тарифа неизвестна. OCR не выполняется; графики и изображения презентаций не интерпретируются. Архивный поиск и недоступные публикации могут дать partial.

Очистка журналов и checkpoints завершённых запусков — 30 дней; интервалы configurable. История чатов хранится отдельно и не удаляется очисткой checkpoints. Удаление организации доступно только owner с подтверждением названия и очищает файлы, checkpoints и связанные записи.

Health: `/api/v1/health/live`, `/api/v1/health/ready`. В диагностике отслеживайте failed/partial runs, возраст недоставленного outbox, время задач и превышения лимитов. Приложение не создаёт новые анализы автоматически по расписанию.

Nginx access log содержит метод, путь без query, статус и время. Его upstream error log отключён, чтобы URL с одноразовыми токенами не попадали в журнал; ошибки приложения диагностируются по requestId. Не включайте стандартный combined log с полным request URI для auth-ссылок.

`FILE_MAX_BYTES`, `FILE_MAX_COUNT`, `FILE_TOTAL_BYTES` управляют upload limits. При повышении размера файла согласуйте `client_max_body_size` в Nginx. На первом холодном старте дождитесь health checks API/web; разовый 502 во время restart не означает потерю данных. Ingress по умолчанию слушает только 127.0.0.1.
