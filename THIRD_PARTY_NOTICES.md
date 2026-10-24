# Сторонние компоненты

Версии зафиксированы в package manifests и pnpm-lock.yaml. Уведомления о лицензиях зависимостей сохраняются в их пакетах.

| Компонент | Назначение | Лицензия/условия |
|---|---|---|
| Next.js, React | Web UI | MIT |
| Tailwind CSS, Radix UI | Стили, доступные UI primitives | MIT |
| Lucide | Иконки | ISC |
| TanStack Query | Серверное состояние клиента | MIT |
| Express, Zod | REST и валидация | MIT |
| Prisma | ORM и миграции | Apache-2.0 |
| PostgreSQL | Данные и FTS | PostgreSQL License |
| Redis 7.4 | Очереди/лимиты | RSALv2 / SSPLv1; проверьте применимость к вашему размещению |
| BullMQ | Фоновые задания | MIT |
| LangGraph JS / PostgresSaver | Собственные графы и checkpoints | MIT |
| PDF.js | PDF extraction | Apache-2.0 |
| Mammoth, yauzl, fast-xml-parser | DOCX/PPTX/ZIP/XML | BSD-2-Clause / MIT |
| Argon2 | Хеширование паролей | MIT и лицензии транзитивных компонентов |
| Nodemailer, Mailpit | SMTP и локальная почта | MIT |
| Vitest, Supertest, Playwright | Проверки | MIT / Apache-2.0 |
| Nginx | Same-origin ingress | BSD-2-Clause |
| Golos Text | Локальный кириллический variable font | SIL Open Font License 1.1; полный текст в apps/web/public/fonts/OFL-GolosText.txt |

## Внешние сервисы и модели

Brave Web Search подключается через пользовательский API key и условия Brave. LLM — настраиваемый OpenAI-совместимый HTTP endpoint/model; конкретная модель не встроена и реально не подключалась при разработке. Использование и обработка данных зависят от выбранного поставщика.

Demo использует собственные синтетические компании, тексты, документы и детерминированные ответы. У него нет реального LLM/search-провайдера, а fixture URLs не являются реальными публикациями. Контрактные тесты не являются live smoke tests.
