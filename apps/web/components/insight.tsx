"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowRight,
  Link as LinkIcon,
  MessagesSquare,
} from "lucide-react";
import { ChatPanel } from "./chat";
import {
  api,
  Button,
  Empty,
  Field,
  date,
  type Row,
  type Action,
} from "./shared";
export function Feed({
  items,
  open,
}: {
  items: Row[];
  open: (x: Row) => void;
}) {
  const [page, setPage] = useState(0);
  return (
    <>
      <div className="insight-grid">
        {items.slice(page * 10, page * 10 + 10).map((row) => (
          <button
            key={row.id}
            className="insight-card"
            onClick={() => open(row)}
          >
            <div className="card-top">
              <span
                className={
                  "severity " +
                  (row.potentialSeverity ? "verify" : row.severity)
                }
              >
                <ArrowUpRight size={13} />
                {row.potentialSeverity
                  ? "Требует проверки"
                  : row.severity === "critical"
                    ? "Критично"
                    : row.severity === "high"
                      ? "Высокая важность"
                      : "Наблюдение"}
              </span>
              <span className="muted">
                {row.unread ? "Новое · " : ""}
                {date(row.updatedAt)}
              </span>
            </div>
            <h2>{row.title}</h2>
            <p>{row.revision?.data?.why}</p>
            <div className="impact">
              <span>
                {row.revision?.data?.risks?.length
                  ? "ВОЗМОЖНЫЙ РИСК"
                  : "ВОЗМОЖНОСТЬ"}
              </span>
              <p>
                {row.revision?.data?.risks?.[0] ||
                  row.revision?.data?.opportunities?.[0]}
              </p>
            </div>
            <div className="card-bottom">
              <span>
                <LinkIcon size={14} />
                {row.revision?.evidence?.length || 0} оснований
              </span>
              <strong>
                Разобраться <ArrowRight size={16} />
              </strong>
            </div>
          </button>
        ))}
      </div>
      {items.length > 10 && (
        <div className="pagination">
          <Button
            kind="secondary"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            Назад
          </Button>
          <span>
            {page + 1} / {Math.ceil(items.length / 10)}
          </span>
          <Button
            kind="secondary"
            disabled={(page + 1) * 10 >= items.length}
            onClick={() => setPage(page + 1)}
          >
            Далее
          </Button>
        </div>
      )}
    </>
  );
}
export function InsightDetail({
  detail,
  base,
  action,
  showSource,
  writable,
}: {
  detail: Row;
  base: string;
  action: Action;
  showSource: (x: Row) => void;
  writable: boolean;
}) {
  const revisions = useQuery({
    queryKey: ["revisions", detail.id],
    queryFn: () => api(base + `/insights/${detail.id}/revisions`),
  });
  const [revisionId, setRevisionId] = useState(detail.revision?.id);
  const selectedRevision =
    revisions.data?.items.find((r: Row) => r.id === revisionId) ||
    detail.revision;
  const d = selectedRevision?.data,
    [chat, setChat] = useState("");
  return (
    <div className="detail-grid">
      <article>
        <span className={"severity " + detail.severity}>
          {detail.potentialSeverity ? "Требует проверки" : "Важное событие"}
        </span>
        <h2>{d?.title || detail.title}</h2>
        {detail.contextChanged && (
          <p className="notice">
            Контекст бизнеса изменился после этой оценки. Для новой оценки
            запустите переанализ периода.
          </p>
        )}
        {detail.lifecycle === "disputed" && (
          <p className="notice">
            Сведения о событии оспариваются или уточнены источником.
          </p>
        )}
        {revisions.data?.items.length > 0 && (
          <Field label="Версия оценки">
            <select
              value={revisionId}
              onChange={(e) => setRevisionId(e.target.value)}
            >
              {revisions.data.items.map((r: Row, i: number) => (
                <option key={r.id} value={r.id}>
                  {date(r.createdAt)} · {i === 0 ? "последняя" : "предыдущая"}
                </option>
              ))}
            </select>
          </Field>
        )}
        {d?.changeSummary && <p className="muted">{d.changeSummary}</p>}
        <p>{d?.summary}</p>
        {[
          ["Почему это важно вам", d?.why],
          ["Горизонт влияния", d?.horizon],
          ["Уверенность и основания", d?.confidenceReason],
        ].map(([label, v]) => (
          <section key={label}>
            <h3>{label}</h3>
            <p>{v}</p>
          </section>
        ))}
        {[
          ["Риски", d?.risks],
          ["Возможности", d?.opportunities],
          ["Что можно сделать", d?.actions],
          ["Что пока неизвестно", d?.unknowns],
        ].map(
          ([label, items]) =>
            items?.length > 0 && (
              <section key={label}>
                <h3>{label}</h3>
                <ul>
                  {items.map((s: string) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            ),
        )}
        <section>
          <h3>Источники и основания</h3>
          {selectedRevision?.evidence?.map((ref: Row, i: number) => (
            <button
              className="evidence"
              key={ref.id}
              onClick={() => showSource(ref)}
            >
              <span>{i + 1}</span>
              <div>
                <strong>
                  {ref.title ||
                    (ref.kind === "external"
                      ? "Публикация"
                      : ref.kind === "company_feature"
                        ? "Факт профиля"
                        : "Документ компании")}
                </strong>
                <small>
                  {ref.publishedAt ? date(ref.publishedAt) : "Дата неизвестна"}{" "}
                  ·{" "}
                  {ref.availability === "available"
                    ? "Доступен"
                    : "Ограниченная доступность"}
                </small>
              </div>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </section>
        {writable && (
          <Field label="Рабочий статус команды">
            <select
              defaultValue={detail.workStatus}
              onChange={(e) =>
                void action(() =>
                  api(base + `/insights/${detail.id}/work-status`, "PATCH", {
                    status: e.target.value,
                  }),
                )
              }
            >
              {[
                ["open", "Открыт"],
                ["in_progress", "В работе"],
                ["resolved", "Решён"],
                ["dismissed", "Отклонён"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="form-actions">
          <span>Полезный инсайт?</span>
          <Button
            kind="secondary"
            onClick={() =>
              void action(() =>
                api(base + `/insights/${detail.id}/feedback`, "POST", {
                  useful: true,
                }),
              )
            }
          >
            Да
          </Button>
          <Button
            kind="secondary"
            onClick={() =>
              void action(() =>
                api(base + `/insights/${detail.id}/feedback`, "POST", {
                  useful: false,
                }),
              )
            }
          >
            Нет
          </Button>
        </div>
      </article>
      <aside className="detail-chat">
        <h3>
          <MessagesSquare size={18} /> Обсудить с агентом
        </h3>
        <p className="muted">
          Личная переписка с опорой на основания этого инсайда.
        </p>
        {chat ? (
          <ChatPanel
            base={base}
            chatId={chat}
            action={action}
            showSource={showSource}
          />
        ) : (
          <>
            <Empty icon={<MessagesSquare />} title="От факта к вашему решению">
              Уточните влияние, проверьте допущения или обсудите следующий шаг.
            </Empty>
            <Button
              onClick={() =>
                void action(async () => {
                  const c = await api(base + "/chats", "POST", {
                    scopeId: detail.scopeId,
                    insightId: detail.id,
                    title: detail.title,
                  });
                  setChat(c.id);
                })
              }
            >
              Начать обсуждение <ArrowRight size={16} />
            </Button>
          </>
        )}
      </aside>
    </div>
  );
}
