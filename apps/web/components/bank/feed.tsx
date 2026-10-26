"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { corporateInsightSchema, type WorkRole } from "@context/contracts";
import { bankApi, pageOf, channelLabels, dateRu } from "./api";
export function BankFeed({
  companyId,
  version,
  role,
  days,
  category,
  query,
}: {
  companyId: string;
  version: number;
  role: WorkRole;
  days: string;
  category: string;
  query: string;
}) {
  const feed = useInfiniteQuery({
    queryKey: ["corporate-feed", companyId, role, days, category],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      bankApi(
        pageOf(corporateInsightSchema),
        `/companies/${companyId}/feed?role=${role}&days=${days}&category=${category}${pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const items = feed.data?.pages.flatMap((x) => x.items) || [];
  if (feed.isPending)
    return (
      <div className="bank-loading" aria-live="polite">
        Собираем вашу ленту…
      </div>
    );
  if (feed.error)
    return (
      <div role="alert" className="bank-error">
        {feed.error.message}
        <button onClick={() => void feed.refetch()}>Повторить</button>
      </div>
    );
  if (!items.length)
    return (
      <div className="bank-empty">
        <span>01 / ПЕРВОЕ ИССЛЕДОВАНИЕ</span>
        <h2>
          Рынок меняется.
          <br />
          Поймите, что это значит для вас.
        </h2>
        <p>
          Запустите анализ: помощник сопоставит события с признаками компании,
          доступными связями и банковскими материалами. До запуска платных
          обращений нет.
        </p>
      </div>
    );
  return (
    <div className="bank-feed">
      <div className="bank-section-line">
        <span>ПЕРСОНАЛЬНАЯ ПОВЕСТКА</span>
        <span>Общая оценка компании · ваш порядок</span>
      </div>
      {items.map((item, i) => (
        <article
          key={item.id}
          className={"bank-signal " + (i === 0 ? "lead" : "")}
          data-category={item.data.category}
          style={{ "--order": Math.min(i, 5) } as React.CSSProperties}
        >
          <div className="bank-signal-number">
            {String(i + 1).padStart(2, "0")}
            <span>
              {item.data.category === "risk"
                ? "РИСК"
                : item.data.category === "opportunity"
                  ? "ВОЗМОЖНОСТЬ"
                  : item.data.category === "mixed"
                    ? "СМЕШАННОЕ"
                    : "КОНТЕКСТ"}
            </span>
          </div>
          <div>
            <div className="bank-meta">
              {item.data.channels.map((x) => channelLabels[x]).join(" / ")}
              <span>{dateRu(item.createdAt)}</span>
            </div>
            <Link
              href={`/bank/${companyId}/insights/${item.id}${query}`}
              className="bank-signal-title"
            >
              {item.data.title}
              <span aria-hidden>↗</span>
            </Link>
            <p>{item.data.why}</p>
            <div className="bank-signal-footer">
              {item.contextVersion !== version && (
                <span>
                  Оценка по предыдущему контексту v{item.contextVersion}.
                  Обновите исследование.
                </span>
              )}
              <span>
                {item.data.bankView
                  ? "Есть банковский тезис с цитатой"
                  : "Подходящая позиция банка не найдена"}
              </span>
              <span>
                {item.synthetic
                  ? "Демонстрационный анализ"
                  : "AI-интерпретация"}{" "}
                · уверенность{" "}
                {item.data.confidence === "high"
                  ? "высокая"
                  : item.data.confidence === "medium"
                    ? "средняя"
                    : "низкая"}
              </span>
            </div>
          </div>
        </article>
      ))}
      {feed.hasNextPage && (
        <button
          className="bank-button light"
          disabled={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
        >
          Ещё материалы
        </button>
      )}
    </div>
  );
}
