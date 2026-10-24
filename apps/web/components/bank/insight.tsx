"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  corporateInsightSchema,
  type CorporateEvidence,
} from "@context/contracts";
import { bankApi, dateRu, channelLabels } from "./api";
export function BankInsight({
  companyId,
  insightId,
  query,
  source,
  run,
}: {
  companyId: string;
  insightId: string;
  query: string;
  source: (e: CorporateEvidence) => void;
  run: (id: string) => void;
}) {
  const item = useQuery({
    queryKey: ["corporate-insight", companyId, insightId],
    queryFn: () =>
      bankApi(
        corporateInsightSchema,
        `/companies/${companyId}/insights/${insightId}`,
      ),
  });
  if (!item.data)
    return (
      <p role={item.error ? "alert" : "status"}>
        {item.error?.message || "Загрузка материала…"}
      </p>
    );
  const i = item.data,
    a = i.data,
    bank = i.evidence.filter((e) => a.bankView?.evidenceIds.includes(e.id));
  const giveFeedback = async (verdict: string) => {
    await bankApi(z.unknown(), `/companies/${companyId}/feedback`, "POST", {
      insightId,
      verdict,
      comment: "",
    });
    window.dispatchEvent(
      new CustomEvent("bank-toast", {
        detail: "Спасибо. Отзыв добавлен в экспертный разбор.",
      }),
    );
  };
  return (
    <article className="bank-reading">
      <Link className="bank-back" href={`/bank/${companyId}/feed${query}`}>
        ← В персональную ленту
      </Link>
      <p className="bank-kicker">
        {a.channels.map((x) => channelLabels[x]).join(" / ")} ·{" "}
        {dateRu(i.createdAt)}
      </p>
      <h1>{a.title}</h1>
      <div className="bank-reading-label">
        {i.synthetic ? "ДЕМОНСТРАЦИОННЫЙ АНАЛИЗ" : "ВЫВОДЫ AI"} · это
        аналитический помощник, не позиция банка
      </div>
      <section>
        <span className="bank-step">01 / СОБЫТИЕ</span>
        <h2>Что произошло</h2>
        <p>{a.what}</p>
      </section>
      <section>
        <span className="bank-step">02 / КОНТЕКСТ КОМПАНИИ</span>
        <h2>Почему это важно вам</h2>
        <p>{a.why}</p>
        <div className="bank-evidence-links">
          {i.evidence
            .filter((e) =>
              a.companyFeatureKeys.some((k) => e.id === `feature:${k}`),
            )
            .map((e) => (
              <button key={e.id} onClick={() => source(e)}>
                {e.title} ↗
              </button>
            ))}
        </div>
      </section>
      <section className="bank-position">
        <span className="bank-step">03 / БАНКОВСКИЙ МАТЕРИАЛ</span>
        <h2>Как оценивает банк</h2>
        {bank.length ? (
          bank.map((e) => (
            <div key={e.id}>
              <p className="bank-position-date">
                {e.title} · {dateRu(e.publishedAt)} · стр. {e.page}
              </p>
              <blockquote>{e.quote}</blockquote>
              <button className="bank-link" onClick={() => source(e)}>
                Проверить цитату и оригинал ↗
              </button>
            </div>
          ))
        ) : (
          <p>
            Подходящая актуальная и проверенная позиция банка не найдена. Выводы
            помощника не заменяют банковскую экспертизу.
          </p>
        )}
      </section>
      <section>
        <span className="bank-step">04 / ВЫВОДЫ AI</span>
        <h2>Возможные последствия</h2>
        {a.consequences.map((t, n) => (
          <p key={n}>{t}</p>
        ))}
      </section>
      <section>
        <span className="bank-step">05 / ПРЕДЛОЖЕНИЕ AI</span>
        <h2>Что проверить</h2>
        <ol>
          {a.checks.map((t, n) => (
            <li key={n}>{t}</li>
          ))}
        </ol>
      </section>
      <section>
        <span className="bank-step">06 / ПРОВЕРЯЕМОСТЬ</span>
        <h2>Основания и ограничения</h2>
        <div className="bank-citations">
          {i.evidence
            .filter(
              (e) =>
                e.kind !== "bank" || a.bankView?.evidenceIds.includes(e.id),
            )
            .map((e) => (
              <button key={e.id} onClick={() => source(e)}>
                <span>
                  {e.kind === "news"
                    ? "СОБЫТИЕ"
                    : e.kind === "bank"
                      ? "БАНК"
                      : "ПРИЗНАК"}
                </span>
                {e.title} ↗
              </button>
            ))}
        </div>
        <ul>
          {a.unknowns.map((t, n) => (
            <li key={n}>{t}</li>
          ))}
        </ul>
        <button className="bank-link" onClick={() => run(i.runId)}>
          Открыть трассу анализа ↗
        </button>
      </section>
      <div className="bank-article-actions">
        <Link
          className="bank-button"
          href={`/bank/${companyId}/chat${query}${query ? "&" : "?"}insight=${insightId}`}
        >
          Обсудить с помощником ↗
        </Link>
        <button
          className="bank-button light"
          onClick={() => void giveFeedback("useful")}
        >
          Полезно
        </button>
        <button
          className="bank-button light"
          onClick={() => void giveFeedback("needs_review")}
        >
          На экспертный разбор
        </button>
      </div>
    </article>
  );
}
