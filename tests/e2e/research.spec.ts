import { test, expect } from "@playwright/test";
test("market: research, comparison, dossier, evidence, brief, routes and motion", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Войти в demo" }).click();
  await expect(
    page.getByRole("heading", { name: /Рынок меняется/ }),
  ).toBeVisible();
  await expect(page.locator(".competitor-tile")).toHaveCount(3);
  await page.route("**/jobs/*/events", (route) => route.abort());
  await page.getByRole("button", { name: "Обновить разведданные" }).click();
  await expect(
    page.getByRole("button", { name: "Обновить разведданные" }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(
    page.getByRole("button", { name: "Читать записку" }),
  ).toBeVisible();
  await page.screenshot({
    path: `.cache/research-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Сравнить 3/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Сравнение предложений" }),
  ).toBeVisible();
  await expect(page.getByText("Ваш продукт", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `.cache/comparison-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Проверить цитату" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Снимок источника" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Сравнение предложений" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".tile-title").first().click();
  const dossierUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Досье конкурента" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Тарифы и условия", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `.cache/dossier-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.goBack();
  await expect(page).toHaveURL(dossierUrl);
  await expect(
    page.getByRole("dialog", { name: "Досье конкурента" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Читать записку" }).click();
  await expect(
    page.getByRole("heading", { name: "Что проверить", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Сохранить решение" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Скачать Markdown" }).click();
  expect((await download).suggestedFilename()).toMatch(/^research-.*\.md$/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Что решили проверить" }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".content")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
});
