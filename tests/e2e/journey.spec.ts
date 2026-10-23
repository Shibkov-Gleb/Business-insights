import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const mailURL = process.env.E2E_MAIL_URL || "http://localhost:8025";
test("demo: инсайт, источник, чат и адаптивная навигация", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Войти в demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Важное для вашего бизнеса." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Получить инсайды", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Получить инсайды", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.locator(".insight-card").first()).toBeVisible();
  await page.screenshot({
    path: `.cache/preview-${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator(".insight-card").first().click();
  await expect(
    page.getByRole("heading", { name: "Почему это важно вам" }),
  ).toBeVisible();
  await page.locator(".evidence").first().click();
  await expect(
    page.getByText("Синтетический источник", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Закрыть", exact: true })
    .click();
  await page.getByRole("button", { name: "Начать обсуждение" }).click();
  await page
    .getByRole("textbox", { name: "Вопрос агенту" })
    .fill("Какие допущения стоит проверить для этого проекта?");
  await page.getByRole("button", { name: "Отправить вопрос" }).click();
  await expect(
    page.getByText("Это демонстрационный разбор на синтетических данных.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Документы." })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("регистрация, подтверждение email, идея с тремя полями и приглашение reader", async ({
  page,
  request,
}, info) => {
  const email = `e2e-${randomUUID()}@example.test`,
    password = "Browser-test-password-2026!";
  await page.goto("/");
  await page
    .getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(
    page.getByText("Письмо для подтверждения отправлено"),
  ).toBeVisible();
  let message: any;
  for (let i = 0; i < 30; i++) {
    const inbox = await (
      await request.get(mailURL + "/api/v1/messages")
    ).json();
    message = inbox.messages?.find((m: any) =>
      m.To?.some((to: any) => to.Address === email),
    );
    if (message) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  expect(message).toBeTruthy();
  const content = await (
    await request.get(mailURL + "/api/v1/message/" + message.ID)
  ).json();
  const match = String(content.Text).match(
    /http:\/\/localhost:\d+\/\?action=verify&token=[a-f0-9]+/,
  );
  expect(match).toBeTruthy();
  await page.goto(match![0]);
  await page
    .getByRole("button", { name: "Подтвердить email", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page
    .getByRole("button", { name: "Создать проект", exact: true })
    .click();
  await page.getByLabel("Название проекта").fill("Идея " + info.project.name);
  await page
    .getByLabel("Что вы делаете или хотите создать?")
    .fill("B2B SaaS автоматизация отчётности для маленьких команд");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page
    .getByRole("button", { name: "Открыть проект", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Важное для вашего бизнеса." }),
  ).toBeVisible();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.getByRole("button", { name: "Команда", exact: true }).click();
  await page
    .getByRole("button", { name: "Создать приглашение", exact: true })
    .click();
  await expect(
    page.getByLabel("Ссылка приглашения — действует 7 дней"),
  ).toHaveValue(/action=invite/);
  const link = await page
    .getByLabel("Ссылка приглашения — действует 7 дней")
    .inputValue();
  const csrf = (await (await request.get("/api/v1/auth/csrf")).json())
    .csrfToken;
  const signed = await request.post("/api/v1/auth/login", {
    headers: { Origin: baseURL, "X-CSRF-Token": csrf },
    data: { email: "reader@example.test", password: "Context-demo-2026!" },
  });
  expect(signed.ok()).toBe(true);
  const signedBody = await signed.json();
  const accepted = await request.post("/api/v1/invitations/accept", {
    headers: {
      Origin: baseURL,
      "X-CSRF-Token": signedBody.csrfToken,
    },
    data: { token: new URL(link).searchParams.get("token") },
  });
  expect(accepted.ok()).toBe(true);
});

test("документ, подтверждение, конкурент, отказ SSE и клавиатура", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Войти в demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Важное для вашего бизнеса." }),
  ).toBeVisible();
  const org = await page
    .getByLabel("Организация", { exact: true })
    .inputValue();
  const csrf = (await (await page.request.get("/api/v1/auth/csrf")).json())
    .csrfToken;
  const created = await page.request.post(
    "/api/v1/organizations/" + org + "/scopes",
    {
      headers: { Origin: baseURL, "X-CSRF-Token": csrf },
      data: { name: "Приёмка " + randomUUID().slice(0, 8) },
    },
  );
  expect(created.ok()).toBe(true);
  const scope = await created.json();
  await page.reload();
  await page.getByLabel("Направление", { exact: true }).selectOption(scope.id);
  async function navigate(name: string) {
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Открыть меню" }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }
  await navigate("Документы");
  const name = "synthetic-" + randomUUID().slice(0, 8) + ".md";
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name,
      mimeType: "text/markdown",
      buffer: await readFile("tests/fixtures/synthetic.md"),
    });
  const row = page.locator(".list-row").filter({ hasText: name });
  await expect(row.getByText("Готов", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await navigate("Профиль бизнеса");
  await page.getByRole("button", { name: scope.name, exact: true }).click();
  await page.getByRole("button", { name: "Подтвердить предложение" }).click();
  await expect(
    page.getByRole("button", { name: "Подтвердить предложение" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "История версий" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate("Конкуренты");
  await page.getByRole("button", { name: "Найти конкурентов" }).click();
  await expect(page.getByText("Синтетическое основание demo")).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(page.getByText("Наблюдаем", { exact: true })).toBeVisible();
  await navigate("Инсайды");
  await page.route("**/jobs/*/events", (route) => route.abort("failed"));
  await page
    .getByRole("button", { name: "Получить инсайды", exact: true })
    .click();
  await expect(page.locator(".insight-card").first()).toBeVisible({
    timeout: 60000,
  });
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Открыть меню" }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar")).not.toBeVisible();
  }
  await page.route("**/insights?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "TEST",
          message: "Сервис временно недоступен",
          requestId: "synthetic",
        },
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Также наблюдать", exact: false })
    .click();
  await expect(
    page.getByText("Сервис временно недоступен", { exact: true }),
  ).toBeVisible();
});
