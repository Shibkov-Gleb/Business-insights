"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Globe,
  Target,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { api, Button, Field, ErrorNote, type Row } from "./shared";
export function Auth({ demo, onDone }: { demo: boolean; onDone: () => void }) {
  const [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("action") === "verify") setMode("verify");
    if (p.get("action") === "reset") setMode("reset");
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const params = new URLSearchParams(location.search);
      if (mode === "verify" || mode === "reset") {
        const r = await api(
          "/auth/" + (mode === "verify" ? "verify-email" : "reset-password"),
          "POST",
          { ...fields, token: params.get("token") },
        );
        setNotice(r.message);
        setMode("login");
        history.replaceState(null, "", "/");
      } else {
        const endpoint =
          mode === "register"
            ? "register"
            : mode === "forgot"
              ? "forgot-password"
              : "login";
        const r = await api("/auth/" + endpoint, "POST", fields);
        if (mode === "login") {
          if (params.get("action") === "invite") {
            await api("/invitations/accept", "POST", {
              token: params.get("token"),
            });
            history.replaceState(null, "", "/");
          }
          onDone();
        } else {
          setNotice(r.message);
          setMode("login");
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-symbol">к</span>контекст.
        </div>
        <div>
          <span className="eyebrow">ОТ СОБЫТИЙ К РЕШЕНИЯМ</span>
          <h1>
            Мир меняется.
            <br />
            Понимайте, что это
            <br />
            значит <em>для вас.</em>
          </h1>
          <p>
            Новости обретают смысл, когда связаны с вашим бизнесом. Соберите
            контекст — увидьте главное.
          </p>
          <div className="auth-steps">
            <span>
              <Target />
              Ваш бизнес
            </span>
            <ChevronRight />
            <span>
              <Globe />
              Внешний мир
            </span>
            <ChevronRight />
            <span>
              <Sparkles />
              Инсайды
            </span>
          </div>
        </div>
        <small>Для идей, стартапов и действующего бизнеса.</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <h2>
            {
              (
                {
                  login: "С возвращением",
                  register: "Создайте аккаунт",
                  forgot: "Восстановление доступа",
                  verify: "Подтвердите email",
                  reset: "Новый пароль",
                } as Row
              )[mode]
            }
          </h2>
          <p className="muted">
            Войдите, чтобы увидеть важное для вашего проекта.
          </p>
          <ErrorNote error={error} />
          {notice && <div className="notice">{notice}</div>}
          <form onSubmit={submit}>
            {!["verify", "reset"].includes(mode) && (
              <Field label="Email">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.ru"
                />
              </Field>
            )}
            {!["verify", "forgot"].includes(mode) && (
              <Field label="Пароль">
                <input
                  type="password"
                  name="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={12}
                  required
                  placeholder="Не менее 12 символов"
                />
              </Field>
            )}
            <Button type="submit" disabled={busy}>
              <ArrowRight size={17} />
              {mode === "login"
                ? "Войти"
                : mode === "register"
                  ? "Создать аккаунт"
                  : mode === "verify"
                    ? "Подтвердить email"
                    : "Продолжить"}
            </Button>
          </form>
          <div className="auth-links">
            <button
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError("");
              }}
            >
              {mode === "register"
                ? "Уже есть аккаунт? Войти"
                : "Нет аккаунта? Зарегистрироваться"}
            </button>
            <button onClick={() => setMode("forgot")}>Забыли пароль?</button>
          </div>
          {demo && (
            <div className="demo-login">
              <strong>Попробовать на демонстрационных данных</strong>
              <p>Три синтетических проекта. Письма доступны в Mailpit.</p>
              <button
                onClick={async () => {
                  try {
                    await api("/auth/demo", "POST", {});
                    onDone();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Войти в demo <ArrowUpRight size={15} />
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
