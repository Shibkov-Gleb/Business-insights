"use client";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  FileText,
  Search,
  RefreshCw,
  X,
  History,
  Users,
  Check,
} from "lucide-react";
import { stages, stageLabels } from "@context/contracts";
import {
  api,
  Button,
  Modal,
  Empty,
  Field,
  Heading,
  ErrorNote,
  Loading,
  date,
  text,
  type Row,
  type Action,
} from "./shared";
export function Wizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState(0),
    [draft, setDraft] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (step === 0) {
        setDraft(await api("/organizations", "POST", fields));
        setStep(1);
      } else if (step === 1) {
        const p = await api(`/organizations/${draft!.id}/profile`);
        await api(`/organizations/${draft!.id}/profile`, "PATCH", {
          expectedVersion: p.current.version,
          fields: Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v),
          ),
        });
        setStep(2);
      } else if (step === 2) {
        setStep(3);
      } else {
        onCreated(draft!.id);
        setStep(0);
        setDraft(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Новый проект">
      <div className="steps">
        {["Основное", "Контекст", "Документы", "Обзор"].map((s, i) => (
          <span key={s} className={i === step ? "current" : ""}>
            {i + 1} {s}
          </span>
        ))}
      </div>
      <ErrorNote error={error} />
      <form onSubmit={submit}>
        {step === 0 ? (
          <>
            <Field label="Название проекта">
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                placeholder="Например, Линия"
              />
            </Field>
            <Field label="Стадия">
              <select name="stage">
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {stageLabels[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Что вы делаете или хотите создать?"
              note="Юридическое лицо, выручка и сайт не обязательны."
            >
              <textarea
                name="description"
                required
                minLength={20}
                maxLength={5000}
                rows={4}
              />
            </Field>
          </>
        ) : step === 1 ? (
          <>
            <p className="muted">Необязательные поля можно пропустить.</p>
            {[
              ["audience", "Аудитория"],
              ["problem", "Проблема"],
              ["goal", "Ближайшая цель"],
              ["geography", "География рынка"],
            ].map(([name, label]) => (
              <Field key={name} label={label}>
                <input name={name} placeholder="Пока неизвестно" />
              </Field>
            ))}
          </>
        ) : step === 2 ? (
          <>
            <p className="muted">
              Извлечённые сведения потребуют вашего подтверждения. Можно
              завершить создание до окончания обработки.
            </p>
            <Field label="Документ (необязательно)">
              <input
                type="file"
                accept=".pdf,.pptx,.docx,.txt,.md"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const f = new FormData();
                  f.set("file", file);
                  try {
                    await api(
                      `/organizations/${draft!.id}/documents`,
                      "POST",
                      f,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </Field>
            <small>До 25 МиБ · PDF, PPTX, DOCX, TXT, MD</small>
          </>
        ) : (
          <div className="panel">
            <h3>{draft?.name}</h3>
            <p>{stageLabels[draft?.stage]}</p>
            <p>{draft?.description}</p>
            <p className="muted">
              Проект сохранён. Документы обрабатываются в фоне; подтвердите
              извлечённые предложения в профиле. Запуск анализа — по вашему
              запросу.
            </p>
          </div>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={busy}>
            {step === 3 ? "Открыть проект" : "Продолжить"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Settings(p: {
  tab: string;
  base: string;
  scoped: string;
  org: Row;
  scope?: Row;
  scopes: Row[];
  action: Action;
  writable: boolean;
}) {
  if (p.tab === "profile") return <Profile {...p} />;
  if (p.tab === "documents") return <Documents {...p} />;
  if (p.tab === "competitors") return <Competitors {...p} />;
  if (p.tab === "sources") return <Sources {...p} />;
  return <Team {...p} />;
}
type Props = {
  base: string;
  scoped: string;
  org: Row;
  scope?: Row;
  scopes: Row[];
  action: Action;
  writable: boolean;
};
function Profile({ base, scoped, org, scope, writable, action }: Props) {
  const [common, setCommon] = useState(true),
    [historyOpen, setHistory] = useState(false);
  const endpoint = (common ? base : scoped) + "/profile";
  const q = useQuery({
    queryKey: ["profile", endpoint],
    queryFn: () => api(endpoint),
  });
  const proposals = useQuery({
    queryKey: ["proposals", endpoint],
    queryFn: () => api((common ? base : scoped) + "/profile-proposals"),
    refetchInterval: 5000,
  });
  const canEdit =
    writable && (!common || ["owner", "admin"].includes(org.membership.role));
  const groups: [string, string[][]][] = [
    [
      "Продукт и аудитория",
      [
        ["description", "Описание"],
        ["problem", "Проблема"],
        ["audience", "Аудитория"],
        ["jtbd", "Задачи клиента"],
        ["valueProposition", "Ценность"],
        ["alternatives", "Альтернативы"],
      ],
    ],
    [
      "Рынок и коммерция",
      [
        ["industry", "Отрасль"],
        ["geography", "География"],
        ["businessModel", "Бизнес-модель"],
        ["channels", "Каналы продаж"],
        ["pricing", "Цены: валюта и период"],
        ["traction", "Метрики: значение и дата"],
      ],
    ],
    [
      "Цели и зависимости",
      [
        ["goal", "Цель"],
        ["hypotheses", "Гипотезы"],
        ["dependencies", "Критичные зависимости"],
        ["suppliers", "Поставщики"],
        ["technology", "Технологии"],
        ["regulation", "Регулирование"],
      ],
    ],
    [
      "Команда и финансы · необязательно",
      [
        ["team", "Команда"],
        ["revenue", "Выручка: валюта и период"],
        ["funding", "Финансирование"],
        ["runway", "Runway"],
        ["budget", "Бюджет: валюта и период"],
        ["website", "Сайт"],
      ],
    ],
  ];
  return (
    <>
      <Heading
        title="Профиль бизнеса"
        description="Чем точнее контекст, тем содержательнее выводы."
      />
      <div className="tabs">
        <button
          className={common ? "active" : ""}
          onClick={() => setCommon(true)}
        >
          Общий профиль
        </button>
        <button
          className={!common ? "active" : ""}
          onClick={() => setCommon(false)}
        >
          {scope?.name}
        </button>
      </div>
      <div className="notice">
        <Users size={17} />
        {common
          ? "Общий профиль виден всей команде. Закрытые сведения добавляйте в отдельное направление."
          : "Дополнения доступны участникам этого направления. Неизменённые поля наследуются из общего профиля."}
      </div>
      <ErrorNote error={q.error} />
      {q.isLoading ? (
        <Loading />
      ) : (
        <form
          key={endpoint + q.data?.current?.version}
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void action(() =>
              api(endpoint, "PATCH", {
                expectedVersion: q.data?.current?.version || 0,
                fields: Object.fromEntries(
                  Object.entries(data)
                    .filter(
                      ([k, v]) =>
                        v !== "" || q.data?.current?.fields?.[k] !== undefined,
                    )
                    .map(([k, v]) => [
                      k,
                      {
                        value: v,
                        assertion:
                          q.data?.current?.fields?.[k]?.assertion ||
                          (k === "hypotheses" ? "hypothesis" : "confirmed"),
                      },
                    ]),
                ),
              }),
            );
          }}
        >
          {groups.map(([title, fields], i) => (
            <details className="panel" key={title} open={i === 0}>
              <summary>{title}</summary>
              <div className="form-grid">
                {fields.map(([key, label]) => (
                  <Field label={label} key={key}>
                    <textarea
                      name={key}
                      rows={key === "description" ? 3 : 2}
                      defaultValue={text(q.data?.current?.fields?.[key])}
                      disabled={!canEdit}
                      placeholder="Пока неизвестно"
                    />
                  </Field>
                ))}
              </div>
            </details>
          ))}
          <div className="form-actions">
            <span className="muted">
              Версия {q.data?.current?.version || 0}
            </span>
            <Button kind="secondary" onClick={() => setHistory(true)}>
              История версий
            </Button>
            {canEdit && <Button type="submit">Сохранить контекст</Button>}
          </div>
        </form>
      )}
      {proposals.data?.items?.map((p: Row) => (
        <div className="panel" key={p.id}>
          <h3>Предложение из документа</h3>
          <p className="muted">
            Требует проверки и подтверждения. Гипотезы сохраняют свой статус.
          </p>
          {Object.entries(p.fields).map(([k, v]) => (
            <p key={k}>
              <strong>{k}: </strong>
              Сейчас: {text(q.data?.current?.fields?.[k]) || "не указано"}.
              Предложено: {text(v)}
              {(v as Row)?.locator && (
                <small>
                  {" "}
                  · Источник:{" "}
                  {Object.entries((v as Row).locator)
                    .map(([k, val]) => `${k}: ${val}`)
                    .join(", ")}
                </small>
              )}
            </p>
          ))}
          {canEdit && (
            <Button
              onClick={() =>
                void action(() =>
                  api(
                    (common ? base : scoped) +
                      `/profile-proposals/${p.id}/confirm`,
                    "POST",
                    {
                      expectedVersion: q.data?.current?.version || 0,
                      fields: p.fields,
                    },
                  ),
                )
              }
            >
              <Check size={16} /> Подтвердить предложение
            </Button>
          )}
        </div>
      ))}
      {["owner", "admin"].includes(org.membership.role) && (
        <form
          className="panel inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(() =>
              api(base + "/scopes", "POST", { name: f.get("name") }),
            );
          }}
        >
          <Field label="Новое направление">
            <input
              name="name"
              minLength={2}
              required
              placeholder="Например, закупки"
            />
          </Field>
          <Button type="submit" kind="secondary">
            <Plus size={16} /> Добавить
          </Button>
        </form>
      )}
      <Modal
        open={historyOpen}
        onClose={() => setHistory(false)}
        title="История контекста"
      >
        {q.data?.history?.map((p: Row) => (
          <div className="panel" key={p.id}>
            <h3>
              Версия {p.version} · {date(p.createdAt)}
            </h3>
            {Object.entries(p.fields).map(([k, v]) => (
              <p key={k}>
                <strong>{k}: </strong>
                {text(v)}
              </p>
            ))}
          </div>
        ))}
      </Modal>
    </>
  );
}
function Documents({ base, scope, writable, action }: Props) {
  const q = useQuery({
    queryKey: ["documents", base],
    queryFn: () => api(base + "/documents"),
    refetchInterval: 3000,
  });
  return (
    <>
      <Heading
        title="Документы"
        description="Презентации и материалы, на которые опирается анализ."
      />
      {writable && (
        <label className="upload-zone">
          <FileText size={28} />
          <strong>Добавьте документ в выбранное направление</strong>
          <span>PDF, PPTX, DOCX, TXT, MD · до 25 МиБ</span>
          <input
            type="file"
            accept=".pdf,.pptx,.docx,.txt,.md"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const f = new FormData();
              f.set("file", file);
              f.set("scopeId", scope!.id);
              await action(() => api(base + "/documents", "POST", f));
              e.target.value = "";
            }}
          />
        </label>
      )}
      <ErrorNote error={q.error} />
      {q.data?.items?.length ? (
        <div className="list-panel">
          {q.data.items.map((d: Row) => (
            <div className="list-row" key={d.id}>
              <FileText />
              <div className="grow">
                <strong>{d.name}</strong>
                <small>
                  {d.scopeId ? "Направление" : "Общий контекст"} ·{" "}
                  {(d.size / 1024).toFixed(0)} КБ · {date(d.createdAt)}
                </small>
              </div>
              <span className="badge">
                {
                  (
                    {
                      uploaded: "В очереди",
                      processing: "Обработка",
                      ready: "Готов",
                      partial: "Частично",
                      failed: "Ошибка",
                      needs_ocr: "Нужен OCR",
                      deleted: "Удалён",
                    } as Row
                  )[d.status]
                }
              </span>
              {d.status !== "deleted" && (
                <a
                  className="text-button"
                  href={`/api/v1${base}/documents/${d.id}/download`}
                >
                  Скачать
                </a>
              )}
              {writable && d.status !== "deleted" && (
                <>
                  <button
                    className="icon-button"
                    aria-label="Повторить обработку"
                    onClick={() =>
                      void action(() =>
                        api(`${base}/documents/${d.id}/retry`, "POST", {}),
                      )
                    }
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Удалить документ"
                    onClick={() => {
                      if (
                        confirm(
                          "Удалить документ и исключить его из новых ответов?",
                        )
                      )
                        void action(() =>
                          api(`${base}/documents/${d.id}`, "DELETE"),
                        );
                    }}
                  >
                    <X size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={<FileText />} title="Документов пока нет">
          Загрузка необязательна. Можно начать с описания бизнеса.
        </Empty>
      )}
    </>
  );
}
function Competitors({ scoped, writable, action }: Props) {
  const q = useQuery({
    queryKey: ["competitors", scoped],
    queryFn: () => api(scoped + "/competitors"),
    refetchInterval: 3000,
  });
  return (
    <>
      <Heading
        title="Конкуренты"
        description="Прямые конкуренты и альтернативные способы решения задачи."
      >
        {writable && (
          <Button
            onClick={() =>
              void action(() =>
                api(scoped + "/competitor-searches", "POST", {}),
              )
            }
          >
            <Search size={16} /> Найти конкурентов
          </Button>
        )}
      </Heading>
      <ErrorNote error={q.error} />
      {q.data?.items?.map((c: Row) => (
        <div className="panel" key={c.id}>
          <div className="list-row">
            <span className="company-avatar">{c.name[0]}</span>
            <div className="grow">
              <h3>{c.name}</h3>
              <span className="muted">
                {c.data.domain || "Домен не указан"}
              </span>
            </div>
            <span className="badge">
              {c.decision === "proposed"
                ? "На подтверждение"
                : c.decision === "rejected"
                  ? "Отклонён"
                  : c.monitoring === "active"
                    ? "Наблюдаем"
                    : "Отключён"}
            </span>
          </div>
          <p>{c.data.reason}</p>
          {c.data.sources?.map((s: string) => (
            <a
              key={s}
              href={s.includes("example.test") ? undefined : s}
              target="_blank"
              rel="noreferrer"
              className="source-link"
            >
              {s.includes("example.test") ? "Синтетическое основание demo" : s}
            </a>
          ))}
          {writable && (
            <div className="form-actions">
              {c.decision === "proposed" ? (
                <>
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void action(() =>
                        api(
                          scoped + `/competitor-proposals/${c.id}/decision`,
                          "POST",
                          { decision: "rejected" },
                        ),
                      )
                    }
                  >
                    Отклонить
                  </Button>
                  <Button
                    onClick={() =>
                      void action(() =>
                        api(
                          scoped + `/competitor-proposals/${c.id}/decision`,
                          "POST",
                          { decision: "confirmed" },
                        ),
                      )
                    }
                  >
                    Подтвердить
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    kind="secondary"
                    onClick={() => {
                      const name = prompt("Название конкурента", c.name);
                      if (name)
                        void action(() =>
                          api(scoped + `/competitors/${c.id}`, "PATCH", {
                            name,
                          }),
                        );
                    }}
                  >
                    Редактировать
                  </Button>
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void action(() =>
                        api(scoped + `/competitors/${c.id}`, "PATCH", {
                          decision: "confirmed",
                          monitoring:
                            c.monitoring === "active" ? "disabled" : "active",
                        }),
                      )
                    }
                  >
                    {c.monitoring === "active" ? "Отключить" : "Включить"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {!q.data?.items?.length && (
        <Empty title="Кого стоит держать в поле зрения?">
          Найдите конкурентов по контексту проекта или добавьте известную
          компанию.
        </Empty>
      )}
      {writable && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            void action(() => api(scoped + "/competitors", "POST", f));
          }}
        >
          <h3>Добавить вручную</h3>
          <div className="form-grid">
            <Field label="Название">
              <input name="name" required minLength={2} />
            </Field>
            <Field label="Домен (необязательно)">
              <input name="domain" placeholder="company.ru" />
            </Field>
            <Field label="Тип">
              <select name="type">
                <option value="direct">Прямой</option>
                <option value="indirect">Косвенный</option>
                <option value="alternative">Альтернатива</option>
              </select>
            </Field>
            <Field label="Почему похожи">
              <input name="reason" />
            </Field>
          </div>
          <Button type="submit" kind="secondary">
            <Plus size={16} /> Добавить
          </Button>
        </form>
      )}
    </>
  );
}
function Sources({ scoped, scope, writable, action }: Props) {
  return (
    <>
      <Heading
        title="Источники и поиск"
        description="Управляйте темами поиска и доступными источниками."
      />
      <form
        key={scope?.id}
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const lines = (k: string) =>
            String(f.get(k) || "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
          void action(() =>
            api(scoped, "PATCH", {
              settings: {
                keywords: lines("keywords"),
                rss: lines("rss"),
                blockedDomains: lines("blockedDomains"),
              },
            }),
          );
        }}
      >
        {[
          ["keywords", "Публичные поисковые темы — по одной на строку"],
          ["rss", "RSS-ленты"],
          ["blockedDomains", "Запрещённые домены"],
        ].map(([name, label]) => (
          <Field key={name} label={label}>
            <textarea
              name={name}
              rows={3}
              defaultValue={scope?.settings?.[name]?.join("\n")}
              disabled={!writable}
            />
          </Field>
        ))}
        <p className="muted">
          Поисковые темы отправляются Brave. Не включайте внутренние цифры,
          имена клиентов и закрытые документы.
        </p>
        {writable && <Button type="submit">Сохранить настройки</Button>}
      </form>
      <div className="panel">
        <h3>Как используются данные</h3>
        <p>
          В live-режиме настроенный LLM получает разрешённый контекст и
          выбранные фрагменты. В demo внешние вызовы не выполняются. Полнота
          оценивается относительно плана поиска.
        </p>
      </div>
    </>
  );
}
function Team({ base, org, scopes, action }: Props) {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const admin = ["owner", "admin"].includes(org.membership.role);
  const q = useQuery({
    queryKey: ["team", base],
    queryFn: () => api(base + "/members"),
    enabled: admin,
  });
  const invites = useQuery({
    queryKey: ["invitations", base],
    queryFn: () => api(base + "/invitations"),
    enabled: admin,
  });
  const [link, setLink] = useState("");
  return (
    <>
      <Heading
        title="Команда"
        description="Общие инсайды, персональный ракурс и понятные права."
      />
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void action(async () => {
            await api(base + `/members/${org.membership.id}`, "PATCH", {
              workRole: data.get("workRole"),
              interests: String(data.get("interests") || "")
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            });
            await api("/auth/me", "PATCH", { timezone: data.get("timezone") });
          });
        }}
      >
        <h3>Мой ракурс и часовой пояс</h3>
        <div className="form-grid">
          <Field label="Рабочая роль">
            <select name="workRole" defaultValue={org.membership.workRole}>
              {[
                ["founder", "Основатель"],
                ["finance", "Финансы"],
                ["sales", "Продажи"],
                ["marketing", "Маркетинг"],
                ["procurement", "Закупки"],
                ["product", "Продукт"],
                ["operations", "Операции"],
                ["other", "Другое"],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Часовой пояс">
            <input
              name="timezone"
              defaultValue={me.data?.timezone || "Europe/Moscow"}
              required
            />
          </Field>
          <Field label="Интересы через запятую">
            <input
              name="interests"
              defaultValue={org.membership.interests?.join(", ")}
            />
          </Field>
        </div>
        <p className="muted">Рабочая роль не расширяет доступ.</p>
        <Button type="submit" kind="secondary">
          Сохранить предпочтения
        </Button>
      </form>
      {!admin ? (
        <Empty
          icon={<Users />}
          title="Управление командой доступно администратору"
        >
          Ваша роль: {org.membership.role}. Рабочие интересы не расширяют
          доступ.
        </Empty>
      ) : (
        <>
          <div className="list-panel">
            {q.data?.items?.map((m: Row) => (
              <div className="list-row" key={m.id}>
                <span className="user-avatar">{m.email?.[0]}</span>
                <div className="grow">
                  <strong>{m.email}</strong>
                  <small>
                    {m.allScopes ? "Все направления" : "Выбранные направления"}
                  </small>
                </div>
                <select
                  aria-label={"Роль " + m.email}
                  value={m.role}
                  disabled={m.role === "owner"}
                  onChange={(e) =>
                    void action(() =>
                      api(base + `/members/${m.id}`, "PATCH", {
                        role: e.target.value,
                      }),
                    )
                  }
                >
                  {["owner", "admin", "analyst", "reader"].map((r) => (
                    <option key={r} value={r} disabled={r === "owner"}>
                      {r}
                    </option>
                  ))}
                </select>
                {m.role !== "owner" && (
                  <button
                    className="icon-button"
                    aria-label="Удалить участника"
                    onClick={() =>
                      void action(() =>
                        api(base + `/members/${m.id}`, "DELETE"),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                scopeIds = f.getAll("scopeIds");
              void action(async () => {
                const r = await api(base + "/invitations", "POST", {
                  email: f.get("email") || undefined,
                  role: f.get("role"),
                  allScopes: !scopeIds.length,
                  scopeIds,
                });
                setLink(r.url);
              });
            }}
          >
            <h3>Пригласить участника</h3>
            <div className="form-grid">
              <Field label="Email (необязательно)">
                <input name="email" type="email" />
              </Field>
              <Field label="Права">
                <select name="role">
                  <option value="reader">Читатель</option>
                  <option value="analyst">Аналитик</option>
                  <option value="admin">Администратор</option>
                </select>
              </Field>
            </div>
            <Field label="Ограничить направления (без выбора — все)">
              <select name="scopeIds" multiple>
                {scopes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit">
              <Plus size={16} /> Создать приглашение
            </Button>
            {link && (
              <Field label="Ссылка приглашения — действует 7 дней">
                <input
                  value={link}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </Field>
            )}
          </form>
          {invites.data?.items?.map((i: Row) => (
            <div className="list-row panel" key={i.id}>
              <div className="grow">
                <strong>{i.email || "Приглашение по ссылке"}</strong>
                <small>
                  {i.role} · до {date(i.expiresAt)}
                </small>
              </div>
              <span className="badge">
                {i.revoked ? "Отозвано" : i.acceptedAt ? "Принято" : "Ожидает"}
              </span>
              {!i.revoked && !i.acceptedAt && (
                <Button
                  kind="secondary"
                  onClick={() =>
                    void action(() =>
                      api(base + `/invitations/${i.id}`, "DELETE"),
                    )
                  }
                >
                  Отозвать
                </Button>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
export function RunHistory({
  scoped,
  runs,
  writable,
  action,
}: {
  scoped: string;
  runs: Row[];
  writable: boolean;
  action: Action;
}) {
  return (
    <>
      <Heading
        title="История анализов"
        description="Периоды, полнота источников и результаты запусков."
      />
      {runs.length ? (
        runs.map((r) => (
          <details className="panel" key={r.id}>
            <summary>
              <span>
                {date(r.windowFrom)} — {date(r.windowTo)}
              </span>
              <span className="badge">
                {
                  (
                    {
                      queued: "В очереди",
                      running: "Анализируем",
                      succeeded: "Завершён",
                      partial: "С пропусками",
                      failed: "Ошибка",
                      cancelled: "Отменён",
                      cancel_requested: "Отменяем",
                    } as Row
                  )[r.status]
                }
              </span>
            </summary>
            <p className="muted">
              {r.mode === "historical_rescan"
                ? "Переоценка истории"
                : "Последовательный анализ"}{" "}
              · {r.coverage.sourceCount || 0} источников
            </p>
            <p>
              Поиски: {r.budget.search || 0} · LLM-вызовы: {r.budget.llm || 0} ·
              Токены:{" "}
              {(r.budget.inputTokens || 0) + (r.budget.outputTokens || 0)} ·
              Стоимость:{" "}
              {r.budget.cost
                ? r.budget.cost.amount +
                  " " +
                  r.budget.cost.currency +
                  " (оценка)"
                : "неизвестна"}
            </p>
            {r.coverage.gaps?.map((g: string) => (
              <p className="notice" key={g}>
                {g}
              </p>
            ))}
            {r.error && <p className="error">{r.error}</p>}
            {r.status === "partial" && (
              <PartialPreviews scoped={scoped} runId={r.id} />
            )}
            {r.status === "partial" && r.coverage.acceptable && writable && (
              <Button
                kind="secondary"
                onClick={() => {
                  if (
                    confirm(
                      "Принять результат с перечисленными пропусками и сдвинуть период анализа?",
                    )
                  )
                    void action(() =>
                      api(
                        scoped + `/insight-runs/${r.id}/accept-partial`,
                        "POST",
                        { confirm: true },
                      ),
                    );
                }}
              >
                Принять результат с пропусками
              </Button>
            )}
          </details>
        ))
      ) : (
        <Empty icon={<History />} title="История начнётся с первого анализа">
          Запуски команды сохраняются здесь вместе с периодом и полнотой поиска.
        </Empty>
      )}
      {writable && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(() =>
              api(scoped + "/insight-runs", "POST", {
                mode: "historical_rescan",
                from: new Date(String(f.get("from"))).toISOString(),
                to: new Date(String(f.get("to"))).toISOString(),
              }),
            );
          }}
        >
          <h3>Переоценить прошлый период</h3>
          <p className="muted">
            Использует текущий профиль. Не изменяет основной период анализа.
          </p>
          <div className="form-grid">
            <Field label="Начало">
              <input name="from" type="date" required />
            </Field>
            <Field label="Конец">
              <input
                name="to"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          </div>
          <Button kind="secondary" type="submit">
            <History size={16} /> Переоценить
          </Button>
        </form>
      )}
    </>
  );
}
function PartialPreviews({ scoped, runId }: { scoped: string; runId: string }) {
  const result = useQuery({
    queryKey: ["previews", runId],
    queryFn: () => api(scoped + `/insight-runs/${runId}/previews`),
  });
  return (
    <div>
      <h3>Предварительные результаты</h3>
      <p className="muted">
        Не включены в принятую ленту. Анализ выполнен не полностью.
      </p>
      <ErrorNote error={result.error} />
      {result.data?.items.map((r: Row) => (
        <div className="panel" key={r.id}>
          <strong>{r.data.title}</strong>
          <p>{r.data.why}</p>
          <p>{r.data.summary}</p>
          <small>Оснований: {r.evidence.length}</small>
        </div>
      ))}
    </div>
  );
}
