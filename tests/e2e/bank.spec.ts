import { test, expect } from "@playwright/test";
async function waitRun(page: import("@playwright/test").Page, jobId: string) {
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/v1/jobs/${jobId}`)).json()).status,
      { timeout: 90000, intervals: [250, 500, 1000] },
    )
    .toMatch(/^(succeeded|partial)$/);
}
test("Альфа: компания → ракурс → лента → источник → чат → экспертный разбор", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Открыть демонстрацию" }).click();
  await expect(
    page.getByRole("heading", { name: "Бизнес в контексте" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Не просто/ }).click();
  await expect(
    page.getByRole("heading", { name: "Повестка вашего бизнеса" }),
  ).toBeVisible();
  await page
    .getByLabel("Компания", { exact: true })
    .selectOption({ label: "Северный металл · синтетический" });
  await page.getByLabel("Профессиональный ракурс").selectOption("treasurer");
  await expect(page).toHaveURL(/role=treasurer/);
  const ack = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/runs$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole("button", { name: "Исследовать" }).click();
  const accepted = await ack;
  expect(accepted.status()).toBe(202);
  await waitRun(page, (await accepted.json()).jobId);
  await expect(page.locator(".bank-signal-title").first()).toBeVisible({
    timeout: 90000,
  });
  await expect(page.locator(".bank-progress")).toHaveCount(0, {
    timeout: 90000,
  });
  await page.screenshot({
    path: `test-results/bank-feed-${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator(".bank-signal-title").first().click();
  await expect(
    page.getByRole("heading", { name: "Почему это важно вам" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Как оценивает банк" }),
  ).toBeVisible();
  const revisions = page.getByLabel("Версия анализа");
  await expect(revisions).toBeVisible();
  const revision = await revisions
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await revisions.selectOption(revision!);
  await expect(page).toHaveURL(new RegExp("revision=" + revision));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Что произошло" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/bank-insight-${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator(".bank-citations button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "На экспертный разбор" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Отзыв добавлен" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Обсудить с помощником" }).click();
  await page
    .getByLabel("Уточняющий вопрос")
    .fill("Как проверить риск рефинансирования в текущем ракурсе?");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(
    page.getByText(/Демонстрационный ответ в ракурсе/).first(),
  ).toBeVisible({ timeout: 60000 });
  await page.reload();
  await expect(page.getByLabel("Профессиональный ракурс")).toHaveValue(
    "treasurer",
  );
  await page
    .getByRole("link", { name: "Экспертиза банка", exact: true })
    .click();
  await expect(page.locator(".bank-materials article")).toHaveCount(9);
  await page.locator(".bank-materials .bank-link").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const original = await page
    .getByRole("link", { name: "Открыть оригинал PDF" })
    .getAttribute("href");
  const pdf = await page.request.get(original!.split("#")[0]);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Контекст компании", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Доступные платёжные связи" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".bank-main")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.screenshot({
    path: `test-results/bank-context-${info.project.name}.png`,
    fullPage: true,
  });
});
test("Альфа: новая новость, отказ SSE, прямой URL и история браузера", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Открыть демонстрацию" }).click();
  await page.getByRole("link", { name: /Не просто/ }).click();
  await page
    .getByLabel("Компания", { exact: true })
    .selectOption({ label: "Меридиан Логистика · синтетический" });
  await expect(page.locator(".bank-feed-tools h2")).toHaveText(
    "Меридиан Логистика · синтетический",
  );
  await page.route("**/api/v1/jobs/*/events", (route) => route.abort());
  await page
    .getByRole("button", { name: "Добавить новость", exact: true })
    .click();
  await page
    .getByLabel("Заголовок", { exact: true })
    .fill("Синтетическое изменение условий кредитования " + Date.now());
  await page
    .getByLabel("Или текст новости")
    .fill(
      "Синтетический новый материал: условия новых корпоративных кредитов пересматриваются. Конкретные договоры и сроки требуют проверки у финансовой службы компании.",
    );
  const ack = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/runs$/.test(new URL(r.url()).pathname),
  );
  await page
    .getByRole("button", { name: "Добавить и проанализировать" })
    .click();
  const accepted = await ack;
  expect(accepted.status()).toBe(202);
  await waitRun(page, (await accepted.json()).jobId);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".bank-progress")).toHaveCount(0, {
    timeout: 90000,
  });
  await page.locator(".bank-signal-title").first().click();
  await expect(
    page.getByRole("heading", { name: "Что произошло" }),
  ).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Что произошло" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(url);
  await page.goForward();
  await expect(page).toHaveURL(url);
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
