"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  companyContextSchema,
  bankMaterialSchema,
  hackathonIntegrationSchema,
  corporateRunSchema,
  corporateChatSchema,
  corporateFeedbackSchema,
  importReportSchema,
  corporateTraceSchema,
  type CorporateEvidence,
  type WorkRole,
} from "@context/contracts";
import {
  bankApi,
  pageOf,
  acceptedSchema,
  dateRu,
  channelLabels,
  useBankPages,
} from "./api";
import { ContextEdit } from "./context-edit";
export function BankContext({
  companyId,
  source,
}: {
  companyId: string;
  source: (e: CorporateEvidence) => void;
}) {
  const context = useQuery({
    queryKey: ["corporate-context", companyId],
    queryFn: () =>
      bankApi(companyContextSchema, `/companies/${companyId}/context`),
  });
  if (!context.data)
    return (
      <p role={context.error ? "alert" : "status"}>
        {context.error?.message || "Загрузка контекста…"}
      </p>
    );
  const c = context.data;
  return (
    <div className="bank-context">
      <ContextEdit context={c} />
      <div className="bank-section-line">
        <span>ПОДТВЕРЖДЁННЫЕ ПРИЗНАКИ</span>
        <span>Версия {c.version}</span>
      </div>
      {c.synthetic && (
        <p className="bank-callout">
          Синтетический корпоративный профиль. Выручка задана в ₽ для
          демонстрации крупного бизнеса.
        </p>
      )}
      <dl className="bank-facts">
        {c.facts.map((f) => (
          <div key={f.key}>
            <dt>{f.evidence.title.split(" · ").at(-1)}</dt>
            <dd>
              {f.value === "1.0"
                ? "Есть признак"
                : f.value === "0.0"
                  ? "Признак отсутствует"
                  : f.key === "REVENUE_COMPANY" && /^\d+$/.test(f.value)
                    ? new Intl.NumberFormat("ru").format(BigInt(f.value)) +
                      (c.synthetic ? " ₽" : " · исходные единицы")
                    : f.value}
              <button
                aria-label={`Источник: ${f.key}`}
                onClick={() => source(f.evidence)}
              >
                ↗
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <h2>Положение в предоставленном наборе</h2>
      {c.group && (
        <p>
          Группа {c.group.id}: доступно {c.group.allowedCompanyIds.length}{" "}
          компаний. {c.group.label}: {c.group.revenueSumRaw}.
        </p>
      )}
      <p>
        Связей с обезличенными физическими лицами: {c.relatedPersonCount}. Они
        не подтверждают владение или контроль.
      </p>
      <p>
        {c.datasetPosition.revenueRank
          ? `Место по исходной выручке: ${c.datasetPosition.revenueRank} из ${c.datasetPosition.companyCount}. Доля выручки внутри датасета: ${c.datasetPosition.datasetRevenueShare ? (Number(c.datasetPosition.datasetRevenueShare) * 100).toFixed(3) + "%" : "неизвестна"}.`
          : "Для этого профиля сравнение с исходным набором не вычислено."}{" "}
        Реальная доля рынка неизвестна.
      </p>
      <h2>Доступные платёжные связи</h2>
      <p>
        Концентрация внутри набора; период и валюта исходных платежей
        неизвестны.
      </p>
      <div className="bank-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Контрагент</th>
              <th>Направление</th>
              <th>Доля связей</th>
              <th>Данные</th>
            </tr>
          </thead>
          <tbody>
            {c.dependencies.map((d, i) => (
              <tr key={i}>
                <td>{d.counterparty}</td>
                <td>{d.direction === "outgoing" ? "Исходящие" : "Входящие"}</td>
                <td>{(d.share * 100).toFixed(1)}%</td>
                <td>
                  {d.unknownCompany
                    ? "Характеристики неизвестны"
                    : "Есть в наборе"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!c.dependencies.length && (
        <p>
          В доступном срезе связи не найдены. Это не означает отсутствия
          контрагентов.
        </p>
      )}
      <h2>Что остаётся неизвестным</h2>
      <ul>
        {c.unknowns.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
export function BankMaterials({
  source,
}: {
  source: (e: CorporateEvidence) => void;
}) {
  const materials = useQuery({
    queryKey: ["bank-materials"],
    queryFn: () => bankApi(pageOf(bankMaterialSchema), "/materials"),
  });
  return (
    <div>
      <p className="bank-intro">
        Экспертные материалы Альфа-Банка. Дата — из документа; исторические
        обзоры сохраняются с предупреждением.
      </p>
      <div className="bank-materials">
        {materials.data?.items.map((m, i) => (
          <article key={m.id}>
            <span className="bank-material-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="bank-kicker">
                {m.pages} стр. · {m.status} ·{" "}
                {m.publishedAt && new Date(m.publishedAt).getFullYear() < 2026
                  ? "ИСТОРИЧЕСКИЙ"
                  : "БАНКОВСКИЙ КОРПУС"}
              </p>
              <h2>{m.title}</h2>
              <p>
                {m.publishedAt
                  ? dateRu(m.publishedAt)
                  : m.dateStatus === "document_month"
                    ? "Август 2026 · день публикации неизвестен"
                    : "Дата требует подтверждения"}
              </p>
              <button
                className="bank-link"
                onClick={() =>
                  source({
                    id: m.id,
                    kind: "bank",
                    sourceId: m.id,
                    page: 1,
                    quote:
                      "Просмотр оригинального материала. Цитату для конкретного тезиса выбирает анализ по релевантным фрагментам.",
                    title: m.title,
                    confidence: "unknown",
                    historical:
                      !!m.publishedAt &&
                      new Date(m.publishedAt).getFullYear() < 2026,
                    publishedAt: m.publishedAt,
                  })
                }
              >
                Читать материал ↗
              </button>
            </div>
          </article>
        ))}
      </div>
      {materials.error && <p role="alert">{materials.error.message}</p>}
      <p className="bank-callout">
        В папке кейса не найден отдельный Commodities performance. Его
        содержание не заменялось вымышленными тезисами.
      </p>
    </div>
  );
}
export function BankChat({
  companyId,
  role,
  insightId,
  busy,
  start,
  source,
}: {
  companyId: string;
  role: WorkRole;
  insightId?: string;
  busy: boolean;
  start: (id: string) => void;
  source: (e: CorporateEvidence) => void;
}) {
  const [question, setQuestion] = useState(""),
    [error, setError] = useState("");
  const chats = useBankPages(
    corporateChatSchema,
    `/companies/${companyId}/chats`,
    ["corporate-chats", companyId],
  );
  async function send() {
    setError("");
    try {
      const accepted = await bankApi(
        acceptedSchema,
        `/companies/${companyId}/chats`,
        "POST",
        { question, insightId, role },
      );
      setQuestion("");
      start(accepted.jobId);
      await chats.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить вопрос");
    }
  }
  return (
    <div className="bank-chat">
      <p className="bank-callout">
        Приватный диалог. Текущий профессиональный ракурс передаётся помощнику;
        доступ к другим компаниям он не открывает.
      </p>
      <div className="bank-chat-history">
        {chats.hasNextPage && (
          <button
            className="bank-button light"
            disabled={chats.isFetchingNextPage}
            onClick={() => void chats.fetchNextPage()}
          >
            Ранние сообщения
          </button>
        )}
        {chats.data?.items
          .slice()
          .reverse()
          .map((c) => (
            <article key={c.id}>
              <p className="bank-kicker">ВЫ · {dateRu(c.createdAt)}</p>
              <h3>{c.question}</h3>
              <div className="bank-chat-answer">
                <span>ПОМОЩНИК AI</span>
                <p>{c.answer || "Готовим ответ…"}</p>
                {c.evidence.length > 0 && (
                  <div className="bank-evidence-links">
                    {c.evidence.map((e) => (
                      <button
                        type="button"
                        key={e.id}
                        onClick={() => source(e)}
                      >
                        {e.title} ↗
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        {!chats.data?.items.length && (
          <div className="bank-empty">
            <h2>
              От события —<br />к вашему вопросу.
            </h2>
            <p>
              Спросите, какие договоры проверить, какие данные уточнить или как
              изменится вывод при другой зависимости.
            </p>
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="bank-question">Уточняющий вопрос</label>
        <textarea
          id="bank-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          minLength={3}
          maxLength={6000}
          placeholder="Что проверить казначею перед рефинансированием?"
          required
        />
        <button
          className="bank-button"
          disabled={busy || question.trim().length < 3}
        >
          Отправить ↗
        </button>
      </form>
      {error && (
        <p role="alert" className="bank-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function BankHistory({
  companyId,
  showTrace,
}: {
  companyId: string;
  showTrace: (id: string) => void;
}) {
  const runs = useBankPages(
    corporateRunSchema,
    `/companies/${companyId}/runs`,
    ["corporate-runs", companyId, "history"],
  );
  return (
    <div className="bank-history">
      {runs.data?.items.map((r) => (
        <article key={r.id}>
          <div>
            <p className="bank-kicker">{dateRu(r.acceptedAt)}</p>
            <h3>
              {r.status === "succeeded"
                ? "Исследование завершено"
                : r.status === "partial"
                  ? "Есть пробелы или непроверенные события"
                  : r.status === "failed"
                    ? "Исследование остановлено"
                    : r.status === "cancelled"
                      ? "Отменено"
                      : "Исследование выполняется"}
            </h3>
            <p>{r.error || r.id}</p>
          </div>
          <button className="bank-link" onClick={() => showTrace(r.id)}>
            Ход и основания ↗
          </button>
        </article>
      ))}
      {!runs.data?.items.length && (
        <p>
          Исследований пока нет. Запуск происходит только по вашему действию.
        </p>
      )}
      {runs.hasNextPage && (
        <button
          className="bank-button light"
          disabled={runs.isFetchingNextPage}
          onClick={() => void runs.fetchNextPage()}
        >
          Ещё исследования
        </button>
      )}
    </div>
  );
}
export function BankTrace({
  companyId,
  runId,
}: {
  companyId: string;
  runId: string;
}) {
  const trace = useQuery({
    queryKey: ["corporate-trace", companyId, runId],
    queryFn: () =>
      bankApi(
        z.object({
          run: corporateRunSchema,
          items: z.array(corporateTraceSchema),
        }),
        `/companies/${companyId}/runs/${runId}/trace`,
      ),
  });
  return (
    <div className="bank-trace">
      {trace.data && (
        <>
          <p>
            Статус: {trace.data.run.status}.{" "}
            {trace.data.run.error
              ? `Причина остановки: ${trace.data.run.error}`
              : ""}
          </p>
          <details>
            <summary>Затраты, лимиты и покрытие запуска</summary>
            <pre>
              {JSON.stringify(
                {
                  budget: trace.data.run.budget,
                  coverage: trace.data.run.coverage,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
      <p>
        Показаны вызовы инструментов, проверяемые результаты и версии.
        Внутренние рассуждения модели не сохраняются.
      </p>
      {trace.data?.items.map((t) => (
        <details key={t.id}>
          <summary>
            {t.stage} / {t.tool} · {t.durationMs} мс · {t.status}
          </summary>
          <pre>{JSON.stringify(t.data, null, 2)}</pre>
        </details>
      ))}
      {trace.error && <p role="alert">{trace.error.message}</p>}
    </div>
  );
}
export function BankFeedback({ companyId }: { companyId: string }) {
  const [error, setError] = useState("");
  const reviews = useBankPages(
    corporateFeedbackSchema,
    `/companies/${companyId}/feedback`,
    ["corporate-feedback", companyId],
  );
  return (
    <div className="bank-feedback">
      <p className="bank-intro">
        Обратная связь формирует очередь экспертного разбора. Авторская разметка
        демонстрации не считается оценкой банковских экспертов.
      </p>
      {reviews.data?.items.map((f) => (
        <article className="bank-review" key={f.id}>
          <p className="bank-kicker">
            {dateRu(f.createdAt)} · {f.reviewStatus}
          </p>
          <h3>{f.verdict}</h3>
          <p>{f.comment || "Без комментария"}</p>
          <p>{f.expertNote}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void bankApi(
                z.unknown(),
                `/companies/${companyId}/feedback/${f.id}`,
                "PATCH",
                {
                  expertNote: String(data.get("note")),
                  reviewStatus: "reviewed",
                },
              )
                .then(() => reviews.refetch())
                .catch((e) => setError(e.message));
            }}
          >
            <label>
              Экспертная заметка
              <input
                name="note"
                minLength={3}
                maxLength={5000}
                required
                placeholder="Проверенные замечания к основаниям и выводу"
              />
            </label>
            <button className="bank-button light">Завершить разбор</button>
          </form>
        </article>
      ))}
      {!reviews.data?.items.length && (
        <p>
          Открытых отзывов пока нет. В материале выберите «На экспертный
          разбор».
        </p>
      )}
      {reviews.hasNextPage && (
        <button
          className="bank-button light"
          disabled={reviews.isFetchingNextPage}
          onClick={() => void reviews.fetchNextPage()}
        >
          Ещё отзывы
        </button>
      )}
      {(error || reviews.error) && (
        <p role="alert">{error || reviews.error?.message}</p>
      )}
    </div>
  );
}
export function BankSettings() {
  const integration = useQuery({
    queryKey: ["bank-integration"],
    queryFn: () => bankApi(hackathonIntegrationSchema, "/integration"),
  });
  const imports = useQuery({
    queryKey: ["corporate-imports"],
    queryFn: () => bankApi(pageOf(importReportSchema), "/imports"),
    retry: false,
  });
  const c = integration.data;
  return (
    <div className="bank-settings">
      {c && (
        <>
          <div className="bank-status">
            <span className={c.readiness.ready ? "online" : "pending"} />
            <div>
              <h2>
                {c.mode === "demo"
                  ? "Демонстрационный контур"
                  : c.readiness.ready
                    ? "Шлюз организаторов настроен"
                    : "Нужны настройки организаторов"}
              </h2>
              <p>
                {c.readiness.error ||
                  (c.budget.accountingMode === "gateway"
                    ? "Разрешённые модели настроены. Общий лимит проверяется у шлюза перед каждым вызовом."
                    : "Разрешённые модели и тарифы проверены конфигурацией")}
              </p>
            </div>
          </div>
          <div className="bank-budget">
            <div>
              <span>СУТОЧНЫЙ ЛИМИТ</span>
              <strong>{Number(c.budget.capRub)} ₽</strong>
            </div>
            <div>
              <span>
                {c.budget.accountingMode === "gateway"
                  ? "ОСТАТОК ЛИМИТА / РЕЗЕРВ"
                  : "СПИСАНО / РЕЗЕРВ"}
              </span>
              <strong>
                {c.budget.accountingMode === "gateway"
                  ? (
                      (100 * Number(c.budget.remainingRub)) /
                      Number(c.budget.capRub)
                    ).toFixed(2) + "%"
                  : Number(c.budget.spentRub).toFixed(2)}{" "}
                / {Number(c.budget.reservedRub).toFixed(2)} ₽
              </strong>
            </div>
            <p>
              Окно с {c.budget.day}, сброс в{" "}
              {String(c.budget.resetHour).padStart(2, "0")}:00 ·{" "}
              {c.budget.timezone}.{" "}
              {c.budget.accountingMode === "gateway"
                ? "Учёт по счётчику шлюза. Тарифы неизвестны, стоимость отдельного ответа в рублях не рассчитана."
                : c.budget.pricingKnown
                  ? "Расчёт по тарифам организаторов."
                  : "Тарифы неизвестны. Платные запросы заблокированы."}
            </p>
          </div>
          <h2>Модели</h2>
          <p>
            Извлечение: {c.readiness.extract || "Gemma — ID ожидается"}.
            Интерпретация и чат: {c.readiness.reason || "GLM — ID ожидается"}.
          </p>
          <p>
            Ключи хранятся только в окружении. Персональный Gemini не
            используется. Автоматических платных исследований нет.
          </p>
          <h2>Область интеграции</h2>
          <p>
            Авторизация и оболочка Альфа-Бизнеса моделируются для хакатона.
            Банковские операции не выполняются.
          </p>
        </>
      )}
      <h2>Качество импорта</h2>
      {imports.data?.items.map((i) => (
        <details key={i.id}>
          <summary>
            {i.filename} · {i.rows.toLocaleString("ru")} записей · {i.status}
          </summary>
          <pre>
            {JSON.stringify(
              { sha256: i.sha256, settings: i.settings, quality: i.report },
              null,
              2,
            )}
          </pre>
        </details>
      ))}
      {imports.error && <p>Отчёты полного импорта доступны администратору.</p>}
      <h2>Интересы</h2>
      <p>
        {Object.values(channelLabels).join(" · ")}. Выберите интересы в шапке
        ленты. Они влияют на ранжирование, сохраняя общий анализ компании.
      </p>
    </div>
  );
}
