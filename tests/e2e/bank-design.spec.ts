import { test, expect } from "@playwright/test";
// Deliberately separate from bank.spec.ts: UI fixtures, no DB or paid providers.
test.skip(
  process.env.BANK_UI_PREVIEW !== "1",
  "Run against pnpm hackathon:ui:preview only",
);
test("Банковское оформление: все разделы, источники, клавиатура и reduced motion", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const screenshot = async (name: string) => {
    await page.screenshot({
      path: `test-results/alfa-design-${name}-${info.project.name}.png`,
      fullPage: name !== "source",
      animations: "disabled",
    });
  };
  const noOverflow = async () =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Войти в контекст" }),
  ).toBeVisible();
  await expect(page.getByText("Хакатонный прототип · Контекст")).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCSS(
    "border-radius",
    "10px",
  );
  await noOverflow();
  await screenshot("login");
  await page
    .getByRole("button", { name: "Открыть демонстрацию ↗", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Бизнес в контексте" }),
  ).toBeVisible();
  await noOverflow();
  await screenshot("home");
  await page.getByRole("link", { name: /Не просто/ }).click();
  await expect(page.locator(".bank-signal")).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: "Новостная аналитика", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Профессиональный ракурс").selectOption("treasurer");
  await expect(page).toHaveURL(/role=treasurer/);
  await noOverflow();
  await screenshot("feed");
  await page.locator(".bank-signal-title").first().click();
  await expect(
    page.getByRole("heading", { name: "Почему это важно вам" }),
  ).toBeVisible();
  await noOverflow();
  await screenshot("insight");
  const source = page
    .locator(".bank-citations button")
    .filter({ hasText: "Учебный документ" });
  await source.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "Это не позиция Альфа-Банка",
  );
  await screenshot("source");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(source).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Что произошло" }),
  ).toBeVisible();
  for (const [name, target] of [
    ["Контекст компании", ".bank-context"],
    ["Группы компаний", ".bank-group"],
    ["Экспертиза банка", ".bank-materials article"],
    ["Помощник", ".bank-chat"],
    ["Исследования", ".bank-history article"],
    ["Экспертный разбор", ".bank-feedback"],
    ["Настройки", ".bank-settings .bank-status"],
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.locator(target).first()).toBeVisible();
    await noOverflow();
    await screenshot(
      name === "Контекст компании"
        ? "context"
        : name === "Экспертиза банка"
          ? "materials"
          : name === "Настройки"
            ? "settings"
            : target.replace(/[^a-z]/g, ""),
    );
  }
  await page
    .getByRole("link", { name: "Новостная аналитика", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".bank-main")).toHaveCSS("animation-name", "none");
  await page.locator(".bank-signal-title").first().click();
  await page.locator(".bank-citations button").first().click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
  expect(errors).toEqual([]);
});
