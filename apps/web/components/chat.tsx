"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveJob } from "./live-job";
import {
  ArrowUp,
  Plus,
  MessagesSquare,
  LockKeyhole,
  Loader2,
} from "lucide-react";
import {
  api,
  Button,
  Empty,
  ErrorNote,
  Heading,
  date,
  type Row,
  type Action,
} from "./shared";
export function ChatPanel({
  base,
  chatId,
  action,
  showSource,
}: {
  base: string;
  chatId: string;
  action: Action;
  showSource: (x: Row) => void;
}) {
  const q = useQuery({
    queryKey: ["chat", chatId],
    queryFn: () => api(base + `/chats/${chatId}`),
  });
  useLiveJob(q.data?.activeJobId || undefined, () => {
    void q.refetch();
  });
  const [question, setQuestion] = useState("");
  const pending = q.data?.messages?.some((m: Row) => m.status === "pending");
  return (
    <div className="chat-panel">
      <div className="chat-privacy">
        <LockKeyhole size={13} />
        {q.data?.visibility === "shared"
          ? "Доступен участникам направления"
          : "Личный разговор"}
        {q.data?.visibility === "private" && (
          <button
            className="text-button"
            onClick={() => {
              if (
                confirm(
                  "Вся текущая переписка станет доступна участникам этого направления. Продолжить?",
                )
              )
                void action(() =>
                  api(base + `/chats/${chatId}/visibility`, "PATCH", {
                    visibility: "shared",
                    confirmEntireThread: true,
                  }),
                );
            }}
          >
            Поделиться
          </button>
        )}
      </div>
      <ErrorNote error={q.error} />
      <div className="messages" aria-live="polite">
        {q.data?.messages?.map((m: Row) => (
          <div className={"message " + m.role} key={m.id}>
            <small>{m.role === "user" ? "Вы" : "Контекст"}</small>
            {m.status === "pending" ? (
              <span className="muted">
                <Loader2 className="spin" size={14} /> Проверяем основания…
              </span>
            ) : m.status === "failed" ? (
              <span className="error">Не удалось получить ответ.</span>
            ) : (
              <p>{m.content}</p>
            )}
            {m.citations?.map((c: Row, i: number) => (
              <button
                className="citation"
                key={c.id}
                onClick={() => showSource(c)}
              >
                [{i + 1}] Источник
              </button>
            ))}
          </div>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          const t = question;
          setQuestion("");
          void action(() =>
            api(base + `/chats/${chatId}/messages`, "POST", { text: t }),
          );
        }}
      >
        <textarea
          aria-label="Вопрос агенту"
          placeholder="Что это значит для нашего проекта?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          required
          maxLength={8000}
        />
        <div>
          <small>Ответы требуют вашей оценки</small>
          <Button
            type="submit"
            disabled={pending || !question.trim()}
            aria-label="Отправить вопрос"
          >
            <ArrowUp size={18} />
          </Button>
        </div>
      </form>
    </div>
  );
}
export function ChatWorkspace({
  base,
  scopeId,
  action,
  showSource,
}: {
  base: string;
  scopeId: string;
  action: Action;
  showSource: (x: Row) => void;
}) {
  const [selected, setSelected] = useState("");
  const q = useQuery({
    queryKey: ["chats", base],
    queryFn: () => api(base + "/chats"),
  });
  return (
    <>
      <Heading
        title="Обсуждения"
        description="Разбирайте события и проверяйте гипотезы вместе с агентом."
      >
        <Button
          onClick={() =>
            void action(async () => {
              const c = await api(base + "/chats", "POST", {
                scopeId,
                title: "Разговор о проекте",
              });
              setSelected(c.id);
            })
          }
        >
          <Plus size={16} /> Новый разговор
        </Button>
      </Heading>
      <div className="chat-layout">
        <div className="thread-list">
          {q.data?.items?.map((c: Row) => (
            <button
              className={selected === c.id ? "active" : ""}
              key={c.id}
              onClick={() => setSelected(c.id)}
            >
              <MessagesSquare size={17} />
              <span>
                {c.title}
                <small>
                  {c.visibility === "private" ? "Личный" : "Общий"} ·{" "}
                  {date(c.createdAt)}
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="panel">
          {selected ? (
            <ChatPanel
              base={base}
              chatId={selected}
              action={action}
              showSource={showSource}
            />
          ) : (
            <Empty icon={<MessagesSquare />} title="Пространство для вопросов">
              Выберите разговор или начните новый. Переписка сохраняется.
            </Empty>
          )}
        </div>
      </div>
    </>
  );
}
