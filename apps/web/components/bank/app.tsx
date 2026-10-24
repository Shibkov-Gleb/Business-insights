"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import {
  corporateCompanyItem,
  corporateRunSchema,
  hackathonIntegrationSchema,
  workRoles,
  workRoleLabels,
  impactChannels,
  type WorkRole,
  type CorporateEvidence,
} from "@context/contracts";
import { api, Modal } from "../shared";
import { useLiveJob } from "../live-job";
import { bankApi, pageOf, acceptedSchema, channelLabels } from "./api";
import { BankFeed } from "./feed";
import { BankInsight } from "./insight";
import { BankSource } from "./sources";
import { BankGroups } from "./groups";
import {
  BankContext,
  BankMaterials,
  BankChat,
  BankHistory,
  BankTrace,
  BankFeedback,
  BankSettings,
} from "./panels";
export default function BankApplication() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
            staleTime: 30000,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <BankWorkspace />
    </QueryClientProvider>
  );
}
const nav = [
  ["home", "Главная", "⌂"],
  ["feed", "Новостная аналитика", "↗"],
  ["context", "Контекст компании", "▦"],
  ["groups", "Группы компаний", "⊞"],
  ["materials", "Экспертиза банка", "≡"],
  ["chat", "Помощник", "↳"],
  ["history", "Исследования", "◷"],
  ["feedback", "Экспертный разбор", "✓"],
  ["settings", "Настройки", "⚙"],
] as const;
const titles: Record<string, string> = {
  home: "Бизнес в контексте",
  feed: "Повестка вашего бизнеса",
  context: "Компания и её связи",
  groups: "Группы и разрешённые компании",
  materials: "Экспертиза Альфа-Банка",
  chat: "Вопросы по существу",
  history: "История исследований",
  feedback: "Качество решений",
  settings: "Настройки и ограничения",
};
function BankLogin({ demo, done }: { demo: boolean; done: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (e) {
        const f = new FormData(e.currentTarget);
        await api("/auth/login", "POST", {
          email: f.get("email"),
          password: f.get("password"),
        });
      } else await api("/auth/demo", "POST");
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="bank-login">
      <div className="bank-login-story">
        <div className="bank-brand">
          <b>
            А<span />
          </b>
          <span>
            Альфа-Бизнес <small>Моделируемая интеграция</small>
          </span>
        </div>
        <p className="bank-kicker">КОНТЕКСТ / НОВОСТНАЯ АНАЛИТИКА</p>
        <h1>
          Важен не шум.
          <br />
          Важны
          <br />
          <em>последствия.</em>
        </h1>
        <p>
          Новости, особенности вашей компании и экспертиза банка — в одной
          причинной цепочке.
        </p>
        <div className="bank-login-index">
          <span>01 / Рынок</span>
          <span>02 / Компания</span>
          <span>03 / Решение</span>
        </div>
      </div>
      <div className="bank-login-form">
        <p className="bank-kicker">РАБОЧЕЕ ПРОСТРАНСТВО РУКОВОДИТЕЛЯ</p>
        <h2>Войти в контекст</h2>
        <p>Демонстрационный вход не связан с реальным интернет-банком.</p>
        <form onSubmit={(e) => void login(e)}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="name@company.ru"
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
            />
          </label>
          <button className="bank-button" disabled={busy}>
            Войти ↗
          </button>
        </form>
        {demo && (
          <>
            <div className="bank-or">ИЛИ</div>
            <button
              className="bank-button light"
              disabled={busy}
              onClick={() => void login()}
            >
              Открыть демонстрацию ↗
            </button>
            <small>Крупный бизнес · три отрасли · разные зависимости</small>
          </>
        )}
        {error && (
          <p role="alert" className="bank-error">
            {error}
          </p>
        )}
        <p className="bank-login-legal">
          AI помогает проверить гипотезы. Банковские тезисы показываются только
          с датой и цитатой источника.
        </p>
      </div>
    </main>
  );
}
function BankWorkspace() {
  const cache = useQueryClient(),
    router = useRouter(),
    path = usePathname(),
    params = useSearchParams();
  const [selectedCompany, setSelectedCompany] = useState<string>();
  useEffect(() => {
    setSelectedCompany(undefined);
  }, [path]);
  const user = useQuery({
    queryKey: ["bank-user"],
    queryFn: async () =>
      z
        .object({ id: z.uuid(), email: z.string() })
        .parse(await api("/auth/me")),
  });
  const cfg = useQuery({
    queryKey: ["public-config"],
    queryFn: async () =>
      z
        .object({ mode: z.enum(["demo", "live"]) })
        .parse(await api("/config/public")),
  });
  const companies = useQuery({
    queryKey: ["bank-companies"],
    enabled: !!user.data,
    queryFn: () => bankApi(pageOf(corporateCompanyItem), "/companies?limit=50"),
  });
  const integration = useQuery({
    queryKey: ["bank-integration"],
    enabled: !!user.data,
    queryFn: () => bankApi(hackathonIntegrationSchema, "/integration"),
  });
  const segments = path.split("/").filter(Boolean),
    company =
      selectedCompany || segments[1]
        ? companies.data?.items.find(
            (c) => c.id === (selectedCompany || segments[1]),
          )
        : companies.data?.items.find((c) => c.synthetic) ||
          companies.data?.items[0];
  const companyId = company?.id || "",
    section = path === "/" ? "home" : segments[2] || "feed";
  const role = (
    workRoles.includes(params.get("role") as WorkRole)
      ? params.get("role")
      : company?.grant.role || "owner"
  ) as WorkRole;
  const days = ["7", "30", "90", "365"].includes(params.get("days") || "")
    ? params.get("days")!
    : "30";
  const category = ["risk", "opportunity", "mixed", "background"].includes(
    params.get("category") || "",
  )
    ? params.get("category")!
    : "all";
  const query = `?role=${role}&days=${days}&category=${category}${params.get("industry") ? "&industry=" + encodeURIComponent(params.get("industry")!) : ""}`;
  const [activeJob, setActiveJob] = useState<string>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [source, setSource] = useState<CorporateEvidence | null>(null),
    [trace, setTrace] = useState<string>(),
    [addNews, setAddNews] = useState(false),
    [toast, setToast] = useState("");
  const runs = useQuery({
    queryKey: ["corporate-runs", companyId],
    enabled: !!companyId,
    queryFn: () =>
      bankApi(pageOf(corporateRunSchema), `/companies/${companyId}/runs`),
  });
  useEffect(() => {
    const run = runs.data?.items.find((x) =>
      ["queued", "running", "cancel_requested"].includes(x.status),
    );
    if (run) setActiveJob(run.id);
  }, [runs.data]);
  useEffect(() => {
    const show = (e: Event) => setToast(String((e as CustomEvent).detail));
    window.addEventListener("bank-toast", show);
    return () => window.removeEventListener("bank-toast", show);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  function refresh() {
    void cache.invalidateQueries({
      predicate: (q) =>
        String(q.queryKey[0]).startsWith("corporate-") ||
        q.queryKey[0] === "bank-integration",
    });
    if (activeJob)
      void api(`/jobs/${activeJob}`)
        .then((r: { status: string; error?: string }) => {
          if (
            ["succeeded", "partial", "failed", "cancelled"].includes(r.status)
          ) {
            setActiveJob(undefined);
            if (r.error) setError(r.error);
          }
        })
        .catch(() => {
          setActiveJob(undefined);
        });
  }
  const live = useLiveJob(activeJob, refresh);
  function changeFilter(name: string, value: string) {
    const p = new URLSearchParams(params);
    p.set(name, value);
    router.push(`/bank/${companyId}/${section}?${p}`);
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  }
  async function analyze(newsIds: string[] = []) {
    if (!company) return;
    const accepted = await bankApi(
      acceptedSchema,
      `/companies/${companyId}/runs`,
      "POST",
      {
        expectedVersion: company.version,
        newsIds,
        search: newsIds.length === 0,
      },
    );
    setActiveJob(accepted.jobId);
    setAddNews(false);
    router.push(`/bank/${companyId}/feed${query}`);
    refresh();
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act(async () => {
      const n = await bankApi(
        z.object({ id: z.uuid() }),
        `/companies/${companyId}/news`,
        "POST",
        {
          title: f.get("title"),
          ...(f.get("url") ? { url: f.get("url") } : {}),
          ...(f.get("text") ? { text: f.get("text") } : {}),
        },
      );
      await analyze([n.id]);
    });
  }
  if (user.isPending || cfg.isPending)
    return (
      <div className="bank-boot" role="status">
        КОНТЕКСТ <span>Подключаем рабочее пространство…</span>
      </div>
    );
  if (!user.data)
    return (
      <BankLogin
        demo={cfg.data?.mode === "demo"}
        done={() => {
          void cache.invalidateQueries();
        }}
      />
    );
  const home = section === "home";
  return (
    <div className="bank-app">
      <a href="#bank-main" className="bank-skip">
        К содержимому
      </a>
      <aside className="bank-nav">
        <Link href="/" className="bank-brand">
          <b>
            А<span />
          </b>
          <span>
            Альфа-Бизнес<small>Демонстрационный контур</small>
          </span>
        </Link>
        <div className="bank-nav-rule" />
        <nav aria-label="Основная навигация">
          {nav.map(([key, title, icon]) => (
            <Link
              key={key}
              aria-current={
                section === key || (section === "insights" && key === "feed")
                  ? "page"
                  : undefined
              }
              href={key === "home" ? "/" : `/bank/${companyId}/${key}${query}`}
            >
              <span aria-hidden>{icon}</span>
              {title}
            </Link>
          ))}
        </nav>
        <div className="bank-nav-bottom">
          <strong>КОНТЕКСТ</strong>
          <p>
            Рыночная разведка
            <br />
            для крупного бизнеса
          </p>
          <button
            onClick={() =>
              void act(async () => {
                await api("/auth/logout", "POST");
                cache.clear();
                router.push("/");
              })
            }
          >
            Выйти ↗
          </button>
        </div>
      </aside>
      <div className="bank-content">
        <header className="bank-topbar">
          <label>
            Компания
            <select
              aria-label="Компания"
              value={companyId}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setActiveJob(undefined);
                router.push(`/bank/${e.target.value}/feed${query}`);
              }}
            >
              {companies.data?.items
                .filter(
                  (c) =>
                    !params.get("industry") ||
                    c.industry === params.get("industry"),
                )
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="bank-user">
            {user.data.email}
            <span>Доступ определяется отдельно от роли</span>
          </div>
        </header>
        <div className="bank-mode">
          {cfg.data?.mode === "demo"
            ? "ДЕМОНСТРАЦИЯ · детерминированный анализ, без вызовов LLM"
            : "LIVE · только модели организаторов"}
          <span>Банковская оболочка и авторизация моделируются</span>
        </div>
        <main id="bank-main" className="bank-main" key={section}>
          <div className="bank-page-heading">
            <div>
              <p className="bank-kicker">АЛЬФА-БИЗНЕС / КОНТЕКСТ</p>
              <h1>{titles[section] || "Интерпретация события"}</h1>
            </div>
            <span className="bank-page-date">
              {new Date().toLocaleDateString("ru", {
                day: "2-digit",
                month: "long",
              })}
              <b>2026</b>
            </span>
          </div>
          {error && (
            <div className="bank-error" role="alert">
              {error}
              <button onClick={() => setError("")}>Закрыть</button>
            </div>
          )}
          {companies.error && <p role="alert">{companies.error.message}</p>}
          {!company && !companies.isPending && (
            <div className="bank-empty">
              <h2>Нет разрешённых компаний</h2>
              <p>
                Попросите администратора предоставить явный доступ.
                Принадлежность к группе и профессиональная роль его не заменяют.
              </p>
            </div>
          )}
          {company && (
            <>
              {home ? (
                <>
                  <Link
                    href={`/bank/${companyId}/feed${query}`}
                    className="bank-home-feature"
                  >
                    <div>
                      <p>НОВОСТНАЯ АНАЛИТИКА</p>
                      <h2>
                        Не просто
                        <br />
                        быть в курсе.
                        <br />
                        <em>Быть готовым.</em>
                      </h2>
                      <span>Открыть персональную повестку ↗</span>
                    </div>
                    <div className="bank-home-aside">
                      <span>01 — СОБЫТИЕ</span>
                      <p>Что изменилось на рынке</p>
                      <span>02 — ЭКСПЕРТИЗА</span>
                      <p>Банковский тезис с источником</p>
                      <span>03 — ВАША КОМПАНИЯ</span>
                      <p>Конкретная зависимость и следующий вопрос</p>
                    </div>
                  </Link>
                  <div className="bank-home-notes">
                    <div>
                      <p className="bank-kicker">ВАШ РАБОЧИЙ КОНТЕКСТ</p>
                      <h3>{company.name}</h3>
                      <p>
                        {company.synthetic
                          ? "Явно синтетический профиль крупного бизнеса. Сведения исходного CSV доступны в других разрешённых карточках."
                          : "Обезличенная компания из предоставленного CSV. Неизвестные единицы и конфликты показываются явно."}
                      </p>
                    </div>
                    <div>
                      <p className="bank-kicker">ДРУГОЙ РАКУРС</p>
                      <h3>
                        Одна компания.
                        <br />
                        Разные вопросы.
                      </h3>
                      <p>
                        Собственник, CFO и казначей видят разный порядок
                        событий. Общая оценка компании сохраняется.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {section !== "materials" && section !== "settings" && (
                    <div className="bank-perspective">
                      <label>
                        Профессиональный ракурс
                        <select
                          aria-label="Профессиональный ракурс"
                          value={role}
                          onChange={(e) => changeFilter("role", e.target.value)}
                        >
                          {workRoles.map((r) => (
                            <option value={r} key={r}>
                              {workRoleLabels[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {section === "feed" && (
                        <>
                          <label>
                            Период
                            <select
                              aria-label="Период"
                              value={days}
                              onChange={(e) =>
                                changeFilter("days", e.target.value)
                              }
                            >
                              <option value="7">7 дней</option>
                              <option value="30">30 дней</option>
                              <option value="90">90 дней</option>
                              <option value="365">Год</option>
                            </select>
                          </label>
                          <label>
                            Отрасль
                            <select
                              aria-label="Отрасль"
                              value={params.get("industry") || ""}
                              onChange={(e) => {
                                const value = e.target.value,
                                  p = new URLSearchParams(params);
                                if (value) p.set("industry", value);
                                else p.delete("industry");
                                const next = value
                                  ? companies.data?.items.find(
                                      (c) => c.industry === value,
                                    )?.id || companyId
                                  : companyId;
                                setSelectedCompany(next);
                                router.push(`/bank/${next}/feed?${p}`);
                              }}
                            >
                              <option value="">Все разрешённые компании</option>
                              {[
                                ...new Set(
                                  companies.data?.items
                                    .map((c) => c.industry)
                                    .filter((x): x is string => !!x),
                                ),
                              ].map((industry) => (
                                <option key={industry} value={industry}>
                                  {industry}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Категория
                            <select
                              aria-label="Категория риска"
                              value={category}
                              onChange={(e) =>
                                changeFilter("category", e.target.value)
                              }
                            >
                              <option value="all">Все сигналы</option>
                              <option value="risk">Риски</option>
                              <option value="opportunity">Возможности</option>
                              <option value="mixed">Смешанные</option>
                              <option value="background">Контекст</option>
                            </select>
                          </label>
                        </>
                      )}
                      <span>Ракурс меняет выдачу, а не права доступа</span>
                    </div>
                  )}
                  {section === "feed" && (
                    <>
                      <div className="bank-feed-tools">
                        <div>
                          <h2>{company.name}</h2>
                          <p>
                            {company.synthetic
                              ? "Синтетический профиль"
                              : "Исходный CSV"}{" "}
                            · контекст v{company.version} ·{" "}
                            {runs.data?.items[0]?.status === "succeeded"
                              ? "последнее исследование успешно"
                              : "дата и статус — в истории исследований"}
                          </p>
                        </div>
                        <div>
                          <button
                            className="bank-button light"
                            disabled={
                              !company.grant.canEdit || busy || !!activeJob
                            }
                            onClick={() => setAddNews(true)}
                          >
                            Добавить новость
                          </button>
                          <button
                            className="bank-button"
                            disabled={
                              !company.grant.canEdit ||
                              busy ||
                              !!activeJob ||
                              (integration.data?.mode === "live" &&
                                !integration.data.readiness.ready)
                            }
                            onClick={() => void act(() => analyze())}
                          >
                            Исследовать ↗
                          </button>
                        </div>
                      </div>
                      <details className="bank-interest">
                        <summary>Мои интересы</summary>
                        <div>
                          {impactChannels.map((c) => (
                            <label key={c}>
                              <input
                                type="checkbox"
                                checked={company.grant.interests.includes(c)}
                                onChange={(e) =>
                                  void act(async () => {
                                    await bankApi(
                                      z.unknown(),
                                      `/companies/${companyId}/preferences`,
                                      "PATCH",
                                      {
                                        role,
                                        interests: e.target.checked
                                          ? [...company.grant.interests, c]
                                          : company.grant.interests.filter(
                                              (x) => x !== c,
                                            ),
                                      },
                                    );
                                    await cache.invalidateQueries({
                                      queryKey: ["bank-companies"],
                                    });
                                    await cache.invalidateQueries({
                                      queryKey: ["corporate-feed"],
                                    });
                                  })
                                }
                              />
                              {channelLabels[c]}
                            </label>
                          ))}
                        </div>
                      </details>
                      <BankFeed
                        companyId={companyId}
                        role={role}
                        days={days}
                        category={category}
                        query={query}
                      />
                    </>
                  )}
                  {section === "insights" && segments[3] && (
                    <BankInsight
                      companyId={companyId}
                      insightId={segments[3]}
                      query={query}
                      source={setSource}
                      run={setTrace}
                    />
                  )}
                  {section === "context" && (
                    <BankContext companyId={companyId} source={setSource} />
                  )}
                  {section === "groups" && <BankGroups query={query} />}
                  {section === "materials" && (
                    <BankMaterials source={setSource} />
                  )}
                  {section === "chat" && (
                    <BankChat
                      companyId={companyId}
                      role={role}
                      insightId={params.get("insight") || undefined}
                      busy={!!activeJob}
                      start={setActiveJob}
                      source={setSource}
                    />
                  )}
                  {section === "history" && (
                    <BankHistory companyId={companyId} showTrace={setTrace} />
                  )}
                  {section === "feedback" && (
                    <BankFeedback companyId={companyId} />
                  )}
                  {section === "settings" && <BankSettings />}
                </>
              )}
            </>
          )}
        </main>
        <footer className="bank-footer">
          <span>КОНТЕКСТ / ХАКАТОН 2026</span>
          <span>Проверяйте источники. AI не выступает от имени банка.</span>
        </footer>
      </div>
      {activeJob && (
        <div className="bank-progress" role="status">
          <span className="bank-pulse" />
          <div>
            <strong>{live.progress || "В очереди"}</strong>
            <small>
              {live.fallback
                ? "Связь прервана: проверяем состояние запросами"
                : "Реальная стадия анализа · без вымышленного процента"}
            </small>
          </div>
          <button
            onClick={() =>
              void act(async () => {
                await bankApi(
                  z.unknown(),
                  `/companies/${companyId}/runs/${activeJob}/cancel`,
                  "POST",
                );
                refresh();
              })
            }
          >
            Отменить
          </button>
        </div>
      )}
      <BankSource
        evidence={source}
        companyId={companyId}
        close={() => setSource(null)}
      />
      <Modal
        open={!!trace}
        onClose={() => setTrace(undefined)}
        title="Трасса исследования"
        wide
      >
        {trace && <BankTrace companyId={companyId} runId={trace} />}
      </Modal>
      <Modal
        open={addNews}
        onClose={() => setAddNews(false)}
        title="Новая новость"
      >
        <form className="bank-new-news" onSubmit={(e) => void add(e)}>
          <p>
            URL или текст пройдёт тот же граф. Дата загрузки не считается датой
            события. Инструкции внутри новости не управляют помощником.
          </p>
          <label>
            Заголовок
            <input name="title" required minLength={3} maxLength={200} />
          </label>
          <label>
            Публичный URL
            <input name="url" type="url" placeholder="https://…" />
          </label>
          <label>
            Или текст новости
            <textarea name="text" minLength={30} maxLength={60000} />
          </label>
          <button className="bank-button" disabled={busy}>
            Добавить и проанализировать ↗
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      </Modal>
      {toast && (
        <div className="bank-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
