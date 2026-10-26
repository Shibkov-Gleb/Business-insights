"use client";
import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Sparkles, X } from "lucide-react";
export type Row = Record<string, any>;
export type Action = (fn: () => Promise<unknown>) => Promise<void>;
let csrf = "";
const pendingKeys = new Map<string, string>();
let displayTimezone = "Europe/Moscow";
export function setDisplayTimezone(timezone: string) {
  displayTimezone = timezone;
}
export async function api(path: string, method = "GET", body?: unknown) {
  // Keep the same key after an uncertain network outcome; successful operations
  // clear it, so an intentional subsequent research starts a new run.
  const signature = method + path + (body instanceof FormData ? Array.from(body.entries()).map(([key, v]) => `${key}:${typeof v === "string" ? v : `${v.name}:${v.size}:${v.lastModified}`}`).join("|") : JSON.stringify(body));
  if (method !== "GET" && !csrf)
    csrf = (await (await fetch("/api/v1/auth/csrf")).json()).csrfToken;
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    headers["X-CSRF-Token"] = csrf;
    if (!pendingKeys.has(signature)) pendingKeys.set(signature, crypto.randomUUID());
    headers["Idempotency-Key"] = pendingKeys.get(signature)!;
  }
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const r = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => { throw new Error(`Сервер недоступен (${r.status}). Повторите запрос.`); });
  if (!r.ok) {
    if (r.status < 500) pendingKeys.delete(signature);
    if (r.status === 403) csrf = "";
    throw new Error(data.error?.message || "Ошибка запроса");
  }
  if (data.csrfToken) csrf = data.csrfToken;
  pendingKeys.delete(signature);
  return data;
}
export const date = (s?: string) =>
  s
    ? new Date(s).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: displayTimezone,
      })
    : "Ещё не проводился";
export const text = (x: any) =>
  x == null ? "" : String(typeof x === "object" && "value" in x ? x.value : x);
export function Button({
  children,
  kind = "",
  ...props
}: {
  children: ReactNode;
  kind?: string;
  [key: string]: any;
}) {
  return (
    <button type="button" className={"button " + kind} {...props}>
      {children}
    </button>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  side = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  side?: boolean;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={
            "modal " + (wide ? "wide " : "") + (side ? "side-panel" : "")
          }
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            // Controlled dialogs have no Radix Trigger to restore focus to.
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
        >
          <div className="modal-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Закрыть">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {note && <small>{note}</small>}
    </label>
  );
}
export function Empty({
  title,
  children,
  icon = <Sparkles />,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" /> Загружаем данные…
    </div>
  );
}
export function ErrorNote({ error }: { error: unknown }) {
  return error ? (
    <div className="error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">КОНТЕКСТ ПРОЕКТА</div>
        <h1>
          {title}
          <span className="accent">.</span>
        </h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
