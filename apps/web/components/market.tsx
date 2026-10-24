"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Plus,
  X,
  Link as LinkIcon,
  Check,
  FileDown,
} from "lucide-react";
import {
  overviewDto,
  dossierDto,
  comparisonDto,
  sourceSnapshotDto,
  researchFields,
  researchLabels,
  stageQuestions,
  type ResearchFact,
  type ResearchBriefDto,
  type Comparison,
} from "@context/contracts";
import {
  api,
  Button,
  Field,
  Modal,
  Loading,
  ErrorNote,
  date,
  text,
  type Action,
} from "./shared";
import { useLiveJob } from "./live-job";
const fetchTyped = async <T,>(path: string, schema: z.ZodType<T>): Promise<T> =>
  schema.parse(await api(path));
const classifications = {
  fact: "Найдено в источнике",
  company_claim: "Заявление компании",
  hypothesis: "Гипотеза",
  user: "Введено пользователем",
};
export function MarketWorkspace({
  scoped,
  stage,
  writable,
  action,
  view,
  onCompetitors,
}: {
  scoped: string;
  stage: string;
  writable: boolean;
  action: Action;
  view: "overview" | "competitors";
  onCompetitors: () => void;
}) {
  const qc = useQueryClient();
  const [days, setDays] = useState(30),
    [selected, setSelected] = useState<string[] | null>(null),
    [dossier, setDossier] = useState<string | null>(null),
    [compare, setCompare] = useState(false),
    [brief, setBrief] = useState<ResearchBriefDto | null>(null),
    [snapshotId, setSnapshotId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["market", scoped, days],
    queryFn: () =>
      fetchTyped(`${scoped}/market-overview?days=${days}`, overviewDto),
  });
  const active = q.data?.runs.find((r) =>
    ["queued", "running", "cancel_requested"].includes(r.status),
  );
  const { progress, fallback } = useLiveJob(active?.id, () => {
    void qc.invalidateQueries();
  });
  const competitors =
    q.data?.competitors.filter((c) => c.decision === "confirmed") || [];
  const chosen = (
    selected ||
    competitors
      .filter((c) => c.monitoring === "active")
      .slice(0, 3)
      .map((c) => c.id)
  ).filter((id) =>
    competitors.some((c) => c.id === id && c.monitoring === "active"),
  );
  const latest = q.data?.briefs[0];
  const source = useQuery({
    queryKey: ["snapshot", scoped, snapshotId],
    queryFn: () =>
      fetchTyped(`${scoped}/source-snapshots/${snapshotId}`, sourceSnapshotDto),
    enabled: !!snapshotId,
  });
  const decisions = useQuery({
    queryKey: ["research-decisions", scoped],
    queryFn: () =>
      fetchTyped(
        scoped + "/research-decisions",
        z.object({
          items: z.array(
            z.object({
              id: z.string(),
              text: z.string(),
              createdAt: z.string(),
            }),
          ),
        }),
      ),
  });
  return (
    <section className="market-workspace">
      <div className="editorial-hero">
        <div className="edition">
          <span>КОНТЕКСТ / РЫНОЧНАЯ РАЗВЕДКА</span>
          <span>01 — ОСНОВАТЕЛЮ</span>
        </div>
        <div className="hero-grid">
          <div>
            <span className="eyebrow">
              {view === "overview"
                ? "ВНЕШНИЙ МИР. ВАШ СЛЕДУЮЩИЙ ХОД."
                : "КОНКУРЕНТЫ И АЛЬТЕРНАТИВЫ"}
            </span>
            <h1>
              {view === "overview" ? (
                <>
                  Рынок меняется.
                  <br />
                  <em>Видеть — раньше.</em>
                </>
              ) : (
                <>
                  Знать альтернативы.
                  <br />
                  <em>Объяснять отличие.</em>
                </>
              )}
            </h1>
          </div>
          <div className="hero-aside">
            <span className="issue-number">
              {String(competitors.length).padStart(2, "0")}
            </span>
            <p>игроков в вашем поле зрения</p>
            <small>
              Последнее успешное исследование
              <br />
              {date(q.data?.lastSuccess || undefined)}
            </small>
          </div>
        </div>
        <div className="hero-bottom">
          <p>{stageQuestions[stage] || stageQuestions.mvp}</p>
          <Button
            disabled={!writable || !!active || !chosen.length}
            onClick={() =>
              void action(() =>
                api(scoped + "/research-runs", "POST", {
                  competitorIds: chosen,
                  includeMarket: true,
                }),
              )
            }
          >
            <RefreshCw size={16} />
            {active ? "Исследование идёт" : "Обновить разведданные"}
          </Button>
        </div>
      </div>
      <ErrorNote error={q.error} />
      {active && (
        <div className="research-progress" role="status">
          <span className="progress-orbit" />
          <div>
            <strong>{progress}</strong>
            <small>
              {fallback
                ? "Связь восстанавливается · проверяем состояние запросами"
                : "Каждый вывод проходит проверку источников"}
            </small>
          </div>
          {writable && (
            <Button
              kind="subtle"
              onClick={() =>
                void action(() =>
                  api(
                    `${scoped}/research-runs/${active.id}/cancel`,
                    "POST",
                    {},
                  ),
                )
              }
            >
              Отменить
            </Button>
          )}
        </div>
      )}
      <div className="section-toolbar">
        <div className="section-kicker">
          {view === "overview" ? "ОБЗОР РЫНКА" : "ВАШ СПИСОК НАБЛЮДЕНИЯ"}
        </div>
        <label className="inline-field">
          Период
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
        </label>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : (
        <>
          {!competitors.length && (
            <div className="editorial-empty">
              <span className="issue-number">01</span>
              <div>
                <h2>Сначала — ваше конкурентное поле</h2>
                <p>
                  Добавьте компании, с которыми клиент сравнивает ваш продукт.
                  Подойдут прямые конкуренты, ручная работа и другие способы
                  решить задачу.
                </p>
                <Button onClick={onCompetitors}>
                  Настроить конкурентов <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}
          {!!competitors.length && (
            <div className="watchlist">
              <div className="section-toolbar">
                <h2>
                  В поле зрения<span className="accent">.</span>
                </h2>
                <Button
                  kind="secondary"
                  disabled={chosen.length < 2}
                  onClick={() => setCompare(true)}
                >
                  Сравнить {chosen.length} предложения{" "}
                  <ArrowUpRight size={16} />
                </Button>
              </div>
              <p className="muted">
                Выберите до пяти компаний для обновления и сравнения. Источники
                и сроки наблюдения видны в досье.
              </p>
              <div className="competitor-strip">
                {competitors.map((c, i) => (
                  <article key={c.id} className="competitor-tile">
                    <div className="tile-top">
                      <span className="serial">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${c.name}`}
                        checked={chosen.includes(c.id)}
                        disabled={
                          c.monitoring !== "active" ||
                          (!chosen.includes(c.id) && chosen.length >= 5)
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...chosen, c.id]
                              : chosen.filter((id) => id !== c.id),
                          )
                        }
                      />
                    </div>
                    <button
                      className="tile-title"
                      onClick={() => setDossier(c.id)}
                    >
                      {c.name}
                      <ArrowUpRight size={19} />
                    </button>
                    <small>
                      {typeof c.data.domain === "string"
                        ? c.data.domain
                        : "Домен не указан"}
                    </small>
                    <span className="tile-status">
                      {c.monitoring === "active"
                        ? "Наблюдаем по запросу"
                        : "Наблюдение отключено"}
                    </span>
                  </article>
                ))}
              </div>
            </div>
          )}
          {view === "overview" && (
            <div className="editorial-columns">
              <article className="lead-story">
                <span className="section-kicker">
                  ГЛАВНЫЙ МАТЕРИАЛ /{" "}
                  {latest ? date(latest.createdAt) : "ПЕРВЫЙ ВЫПУСК"}
                </span>
                <h2>
                  {latest
                    ? "Что это меняет для вашего предложения"
                    : "Данные превращаются в аргументы"}
                </h2>
                <p>
                  {latest?.content.observation ||
                    "Запустите исследование: соберём предложения конкурентов, проверим основания и выделим вопросы, которые стоит обсудить с клиентами."}
                </p>
                {latest && (
                  <>
                    <blockquote>{latest.content.implication}</blockquote>
                    <Button kind="dark" onClick={() => setBrief(latest)}>
                      Читать записку <ArrowUpRight size={16} />
                    </Button>
                  </>
                )}
              </article>
              <aside className="signal-column">
                <div className="section-kicker">ИЗМЕНЕНИЯ / ДО 3 ГЛАВНЫХ</div>
                {q.data?.changes.slice(0, 3).map((c, i) => (
                  <button
                    className="signal-row"
                    key={c.id}
                    onClick={() => setDossier(c.competitorId)}
                  >
                    <span className="serial">0{i + 1}</span>
                    <div>
                      <strong>
                        {competitors.find((x) => x.id === c.competitorId)?.name}
                      </strong>
                      <h3>
                        {researchLabels[
                          c.field as keyof typeof researchLabels
                        ] || c.field}
                      </h3>
                      <p>{c.after.value}</p>
                      <small>
                        {date(c.createdAt)} · Есть предыдущее основание
                      </small>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
                {!q.data?.changes.length && (
                  <p className="quiet-empty">
                    Подтверждённых изменений за период нет. Первое исследование
                    создаёт базовую версию, а не искусственную новость.
                  </p>
                )}
              </aside>
            </div>
          )}
          {latest?.content.opportunities.length ? (
            <section className="opportunity-section">
              <div className="section-toolbar">
                <h2>Пространство возможностей</h2>
                <span className="badge">Гипотезы для проверки</span>
              </div>
              {latest.content.opportunities.map((o, i) => (
                <div key={i} className="opportunity-row">
                  <span className="serial">0{i + 1}</span>
                  <div>
                    <small>
                      {
                        {
                          segment: "СЕГМЕНТ КЛИЕНТОВ",
                          positioning: "ПОЗИЦИОНИРОВАНИЕ",
                          channel: "КАНАЛ ПРИВЛЕЧЕНИЯ",
                          partnership: "ПАРТНЁРСТВО",
                        }[o.category]
                      }
                    </small>
                    <p>{o.text}</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setSnapshotId(o.sourceSnapshotIds[0])}
                  >
                    Основание <LinkIcon size={14} />
                  </button>
                </div>
              ))}
            </section>
          ) : null}
          {!!q.data?.gaps.length && (
            <details className="coverage-note" open>
              <summary>Чего мы пока не знаем</summary>
              <ul>
                {q.data.gaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </details>
          )}
          {q.data?.runs[0]?.status === "failed" && (
            <ErrorNote
              error={`Исследование не завершилось: ${q.data.runs[0].error || "неизвестная ошибка"}. Последние сохранённые данные доступны.`}
            />
          )}
          {!!decisions.data?.items.length && (
            <section className="decision-journal">
              <div className="section-kicker">ЖУРНАЛ КОМАНДЫ</div>
              <h2>Что решили проверить</h2>
              {decisions.data.items.map((d) => (
                <article key={d.id}>
                  <small>
                    {date(d.createdAt)} · Гипотеза, подтверждена к проверке
                  </small>
                  <p>{d.text}</p>
                </article>
              ))}
            </section>
          )}
          {!!q.data?.runs.length && (
            <details className="coverage-note">
              <summary>История исследований и расходы</summary>
              {q.data.runs.map((r) => (
                <div className="research-run-row" key={r.id}>
                  <span>{date(r.acceptedAt)}</span>
                  <strong>
                    {{
                      succeeded: "Завершено",
                      partial: "Частично",
                      failed: "Ошибка",
                      cancelled: "Отменено",
                      running: "В работе",
                      queued: "В очереди",
                      cancel_requested: "Отмена",
                    }[r.status] || r.status}
                  </strong>
                  <small>
                    LLM: {String(r.budget.llm || 0)} · Поиск:{" "}
                    {String(r.budget.search || 0)} · Стоимость:{" "}
                    {r.budget.cost
                      ? JSON.stringify(r.budget.cost)
                      : "неизвестна"}
                  </small>
                </div>
              ))}
            </details>
          )}
        </>
      )}
      <Modal
        open={!!dossier}
        onClose={() => setDossier(null)}
        title="Досье конкурента"
        wide
      >
        {dossier && (
          <CompetitorDossier
            scoped={scoped}
            competitorId={dossier}
            writable={writable}
            action={action}
            openSource={setSnapshotId}
          />
        )}
      </Modal>
      <Modal
        open={compare}
        onClose={() => setCompare(false)}
        title="Сравнение предложений"
        wide
      >
        {compare && (
          <ComparisonView
            scoped={scoped}
            ids={chosen}
            openSource={setSnapshotId}
          />
        )}
      </Modal>
      <Modal
        open={!!brief}
        onClose={() => setBrief(null)}
        title="Записка основателю"
        wide
      >
        {brief && (
          <div className="research-brief">
            <span className="section-kicker">
              РЫНОК / КЛИЕНТ / СЛЕДУЮЩИЙ ШАГ
            </span>
            <h2>{brief.title}</h2>
            {[
              ["01", "Наблюдение", brief.content.observation],
              ["02", "Что это значит для клиента", brief.content.implication],
              ["03", "Возможный ответ · гипотеза", brief.content.response],
              ["04", "Что проверить", brief.content.validation],
            ].map(([n, label, value]) => (
              <section key={n}>
                <span className="serial">{n}</span>
                <div>
                  <h3>{label}</h3>
                  <p>{value}</p>
                </div>
              </section>
            ))}
            <details>
              <summary>Что пока неизвестно</summary>
              <ul>
                {brief.content.unknowns.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
            <div className="brief-evidence">
              {brief.evidence.map((s) => (
                <button key={s.id} onClick={() => setSnapshotId(s.id)}>
                  <LinkIcon size={14} />
                  {s.title}
                </button>
              ))}
            </div>
            <div className="form-actions">
              <a
                className="button secondary"
                href={`/api/v1${scoped}/research-briefs/${brief.id}/export`}
              >
                <FileDown size={16} />
                Скачать Markdown
              </a>
              {writable && (
                <Button
                  onClick={() => {
                    if (
                      confirm(
                        "Сохранить гипотезу и следующий шаг в журнал команды этого направления?",
                      )
                    )
                      void action(() =>
                        api(
                          `${scoped}/research-briefs/${brief.id}/decision`,
                          "POST",
                          { confirm: true },
                        ),
                      );
                  }}
                >
                  <Check size={16} />
                  Сохранить решение
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!snapshotId}
        onClose={() => setSnapshotId(null)}
        title="Снимок источника"
        side
      >
        <ErrorNote error={source.error} />
        {source.isLoading ? (
          <Loading />
        ) : (
          source.data && (
            <div className="source-detail">
              <span className="section-kicker">НЕИЗМЕНЯЕМОЕ ОСНОВАНИЕ</span>
              <h2>{source.data.title}</h2>
              <p className="muted">
                Наблюдение: {date(source.data.observedAt)}
                <br />
                Публикация:{" "}
                {source.data.publishedAt
                  ? date(source.data.publishedAt)
                  : "дата неизвестна"}
              </p>
              <blockquote>{source.data.text}</blockquote>
              {!source.data.canonicalUrl.includes("example.test") && (
                <a
                  href={source.data.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть оригинал <ArrowUpRight size={16} />
                </a>
              )}
            </div>
          )
        )}
      </Modal>
    </section>
  );
}
function Fact({
  fact,
  openSource,
}: {
  fact: ResearchFact;
  openSource: (id: string) => void;
}) {
  return (
    <div className="research-fact">
      <p>{fact.value}</p>
      <small>
        {classifications[fact.classification]} · {date(fact.observedAt)}
      </small>
      {fact.price && (
        <small>
          {fact.price.amount} {fact.price.currency} / {fact.price.period} /{" "}
          {fact.price.unit}
          <br />
          {fact.price.conditions}
        </small>
      )}
      {fact.sourceSnapshotId && (
        <button
          className="text-button"
          onClick={() => openSource(fact.sourceSnapshotId!)}
        >
          <LinkIcon size={12} />
          Проверить цитату
        </button>
      )}
    </div>
  );
}
function CompetitorDossier({
  scoped,
  competitorId,
  writable,
  action,
  openSource,
}: {
  scoped: string;
  competitorId: string;
  writable: boolean;
  action: Action;
  openSource: (id: string) => void;
}) {
  const endpoint = `${scoped}/competitors/${competitorId}`;
  const q = useQuery({
    queryKey: ["dossier", endpoint],
    queryFn: () => fetchTyped(endpoint + "/dossier", dossierDto),
  });
  const [version, setVersion] = useState("");
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const d = q.data,
    snapshot = d.snapshots.find((s) => s.id === version) || d.snapshots[0],
    manual = z
      .record(z.string(), z.string())
      .catch({})
      .parse(d.competitor.data.manualFacts || {});
  return (
    <div className="dossier">
      <div className="dossier-heading">
        <span className="section-kicker">КОНКУРЕНТ / ПУБЛИЧНЫЕ СВЕДЕНИЯ</span>
        <h2>{d.competitor.name}</h2>
        <p>{String(d.competitor.data.domain || "")}</p>
      </div>
      {d.snapshots.length > 0 && (
        <Field label="Версия досье">
          <select
            value={snapshot?.id}
            onChange={(e) => setVersion(e.target.value)}
          >
            {d.snapshots.map((s, i) => (
              <option key={s.id} value={s.id}>
                {date(s.createdAt)} ·{" "}
                {i === 0 ? "Последняя" : `Версия ${d.snapshots.length - i}`}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="dossier-facts">
        {researchFields.map((field) => (
          <section key={field}>
            <h3>{researchLabels[field]}</h3>
            <div>
              {manual[field] && (
                <div className="manual-fact">
                  <p>{manual[field]}</p>
                  <small>Введено пользователем · отдельно от источников</small>
                </div>
              )}
              {snapshot?.facts
                .filter((f) => f.field === field)
                .map((f, i) => (
                  <Fact key={i} fact={f} openSource={openSource} />
                ))}
              {!snapshot?.facts.some((f) => f.field === field) && (
                <p className="muted">Нет данных</p>
              )}
              {(snapshot?.facts.filter((f) => f.field === field).length || 0) >
                1 && (
                <p className="notice">
                  Несколько утверждений: сопоставьте источники и условия.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
      {writable && (
        <details className="coverage-note">
          <summary>Добавить своё уточнение</summary>
          <form
            key={d.competitor.revision}
            onSubmit={(e) => {
              e.preventDefault();
              const fields = Object.fromEntries(new FormData(e.currentTarget));
              void action(() =>
                api(endpoint + "/manual-facts", "PATCH", {
                  expectedVersion: d.competitor.revision,
                  fields,
                }),
              );
            }}
          >
            {researchFields.map((field) => (
              <Field key={field} label={researchLabels[field]}>
                <textarea
                  name={field}
                  defaultValue={manual[field] || ""}
                  maxLength={3000}
                />
              </Field>
            ))}
            <Button type="submit">Сохранить уточнения</Button>
          </form>
        </details>
      )}
      <h3>
        Страницы наблюдения <span className="muted">{d.sources.length}/5</span>
      </h3>
      <p className="muted">
        Загружаются только при запуске исследования. Недоступность не считается
        изменением продукта.
      </p>
      {d.sources.map((s) => (
        <div className="watch-source" key={s.id}>
          <span>{s.url}</span>
          <small>{s.category}</small>
          {writable && (
            <button
              className="icon-button"
              aria-label="Удалить страницу наблюдения"
              onClick={() =>
                void action(() =>
                  api(endpoint + `/watch-sources/${s.id}`, "DELETE", {
                    expectedVersion: s.version,
                  }),
                )
              }
            >
              <X size={15} />
            </button>
          )}
        </div>
      ))}
      {writable && d.sources.length < 5 && (
        <form
          className="watch-source-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            void action(async () => {
              await api(
                endpoint + "/watch-sources",
                "POST",
                Object.fromEntries(new FormData(form)),
              );
              form.reset();
            });
          }}
        >
          <Field label="URL публичной страницы">
            <input
              name="url"
              type="url"
              required
              placeholder="https://example.com/pricing"
            />
          </Field>
          <Field label="Тип страницы">
            <select name="category">
              <option value="product">Продукт</option>
              <option value="pricing">Тарифы</option>
              <option value="updates">Обновления</option>
              <option value="cases">Кейсы</option>
              <option value="news">Новости</option>
            </select>
          </Field>
          <Button type="submit" kind="secondary">
            <Plus size={16} />
            Закрепить
          </Button>
        </form>
      )}
      <h3>История содержательных изменений</h3>
      {!d.changes.length && (
        <p className="quiet-empty">
          Изменений пока нет. Первое наблюдение создаёт базу для будущего
          сравнения.
        </p>
      )}
      {d.changes.map((c) => (
        <article className="change-pair" key={c.id}>
          <div className="section-kicker">
            {researchLabels[c.field as keyof typeof researchLabels]} ·{" "}
            {date(c.createdAt)}
          </div>
          <div>
            <section>
              <small>БЫЛО</small>
              <Fact fact={c.before} openSource={openSource} />
            </section>
            <ArrowRight size={18} />
            <section>
              <small>СТАЛО</small>
              <Fact fact={c.after} openSource={openSource} />
            </section>
          </div>
        </article>
      ))}
    </div>
  );
}
function ComparisonView({
  scoped,
  ids,
  openSource,
}: {
  scoped: string;
  ids: string[];
  openSource: (id: string) => void;
}) {
  const q = useQuery({
    queryKey: ["comparison", scoped, ids.join(",")],
    queryFn: () =>
      fetchTyped(
        `${scoped}/competitor-comparison?ids=${ids.join(",")}`,
        comparisonDto,
      ),
  });
  const [mobileIndex, setMobileIndex] = useState(0);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const data: Comparison = q.data;
  const ownKeys: Record<string, string[]> = {
    audience: ["targetCustomer", "audience"],
    offer: ["valueProposition", "description"],
    features: ["features", "product"],
    pricing: ["pricing", "monetization"],
    integrations: ["integrations", "technology"],
    cases: ["cases", "traction"],
    updates: ["updates"],
  };
  return (
    <div className="comparison">
      <p className="notice">
        «Нет данных» не означает отсутствие функции. Тарифы сравнивайте с учётом
        валюты, периода, единицы оплаты и ограничений.
      </p>
      <div className="comparison-mobile-controls">
        <Button
          kind="secondary"
          disabled={mobileIndex === 0}
          onClick={() => setMobileIndex((i) => i - 1)}
        >
          <ArrowLeft size={16} />
        </Button>
        <span>{data.competitors[mobileIndex]?.competitor.name}</span>
        <Button
          kind="secondary"
          disabled={mobileIndex === data.competitors.length - 1}
          onClick={() => setMobileIndex((i) => i + 1)}
        >
          <ArrowRight size={16} />
        </Button>
      </div>
      <div className="comparison-scroll">
        <table>
          <thead>
            <tr>
              <th>Критерий</th>
              <th className="own-column">Ваш продукт</th>
              {data.competitors.map((c, i) => (
                <th
                  key={c.competitor.id}
                  className={i !== mobileIndex ? "mobile-hidden" : ""}
                >
                  {c.competitor.name}
                  <small>
                    {c.observedAt ? date(c.observedAt) : "Ещё не исследован"}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {researchFields.map((field) => (
              <tr key={field}>
                <th>{researchLabels[field]}</th>
                <td className="own-column">
                  {ownKeys[field].map((k) => text(data.own[k])).find(Boolean) ||
                    "Нет данных"}
                  <small>Из вашего профиля</small>
                </td>
                {data.competitors.map((c, i) => (
                  <td
                    key={c.competitor.id}
                    className={i !== mobileIndex ? "mobile-hidden" : ""}
                  >
                    {c.manual[field] && (
                      <div className="manual-fact">
                        {c.manual[field]}
                        <small>Введено пользователем</small>
                      </div>
                    )}
                    {c.facts
                      .filter((f) => f.field === field)
                      .map((f, n) => (
                        <Fact key={n} fact={f} openSource={openSource} />
                      ))}
                    {!c.facts.some((f) => f.field === field) && (
                      <span className="muted">Нет данных</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
