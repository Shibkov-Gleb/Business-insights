import { test, expect } from "@playwright/test";
const path = process.env.E2E_LIVE_INSIGHT_PATH;
test.use({ storageState: process.env.E2E_STORAGE_STATE });
test.skip(
  !path || (!process.env.E2E_TEST_PASSWORD && !process.env.E2E_STORAGE_STATE),
  "Explicit live acceptance only; credentials come from the environment.",
);
async function login(page: import("@playwright/test").Page) {
  if (process.env.E2E_STORAGE_STATE) {
    await page.goto(path!);
    return;
  }
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.E2E_TEST_EMAIL || "founder@example.test");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Войти ↗", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Бизнес в контексте" }),
  ).toBeVisible();
  await page.goto(path!);
}
test("Live: реальный инсайт, цитата, ссылка, reduced motion и бюджет", async ({
  page,
}, info) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Что произошло" }),
  ).toBeVisible();
  await expect(page.getByText(/23 октября 2026/).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".bank-citations button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Почему это важно вам" }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".bank-main")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.screenshot({
    path: "test-results/live-" + info.project.name + ".png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Настройки", exact: true }).click();
  await expect(
    page.getByText(/стоимость отдельного ответа в рублях не рассчитана/),
  ).toBeVisible();
  await expect(
    page.getByText("Шлюз организаторов настроен", { exact: true }),
  ).toBeVisible();
});
test("Live: GLM-чат через очередь при потере SSE", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Один платный вопрос");
  await login(page);
  await page.getByRole("link", { name: "Обсудить с помощником" }).click();
  await page.route("**/api/v1/jobs/*/events", (r) => r.abort());
  const question =
    "Live проверка " +
    Date.now() +
    ": какие два документа уточнить финансовому директору перед рефинансированием?";
  await page.getByLabel("Уточняющий вопрос").fill(question);
  const ack = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/chats$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole("button", { name: "Отправить ↗" }).click();
  const response = await ack;
  expect(response.status()).toBe(202);
  const job = (await response.json()).jobId;
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/jobs/" + job)).json()).status,
      { timeout: 110000, intervals: [1000] },
    )
    .toBe("succeeded");
  const article = page.locator(".bank-chat-history article").filter({
    has: page.getByRole("heading", { name: question, exact: true }),
  });
  await expect(article.locator(".bank-chat-answer p")).not.toHaveText(
    "Готовим ответ…",
    { timeout: 20000 },
  );
  await expect(article).not.toContainText("Демонстрационный ответ");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: question, exact: true }),
  ).toBeVisible();
});
