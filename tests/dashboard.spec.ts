import { expect, test, type Locator } from "@playwright/test";

const AREA_ORDER = ["北海道", "東北", "東京", "中部", "北陸", "関西", "中国", "四国", "九州", "沖縄"];

async function getSelectOptions(locator: Locator): Promise<string[]> {
  return locator.locator("option").evaluateAll((options) =>
    options.map((option) => (option.textContent ?? "").trim()).filter(Boolean),
  );
}

test("dashboard smoke renders key sections", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "送電潮流 × ユニット発電実績 ダッシュボード" })).toBeVisible();
  await expect(page.getByText("全国発電量")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "発電方式 構成比" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリアネットワーク潮流（地域内送電線）" })).toBeVisible();
});

test("area selectors use utility-area ordering by default", async ({ page }) => {
  await page.goto("/");

  const headerAreaSelect = page.getByLabel("エリア", { exact: true });
  const trendAreaSelect = page.getByLabel("表示エリア", { exact: true }).first();
  const donutAreaSelect = page.getByLabel("表示エリア", { exact: true }).nth(1);

  await expect(headerAreaSelect).toBeVisible();
  await expect(trendAreaSelect).toBeVisible();
  await expect(donutAreaSelect).toBeVisible();

  await expect(await getSelectOptions(headerAreaSelect)).toEqual(["全エリア", ...AREA_ORDER]);
  await expect(await getSelectOptions(trendAreaSelect)).toEqual(["全エリア", ...AREA_ORDER]);
  await expect(await getSelectOptions(donutAreaSelect)).toEqual(["全エリア", ...AREA_ORDER]);
});

test("overview mode hides deep-dive sections", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "俯瞰モード" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリアネットワーク潮流（地域内送電線）" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "高発電ユニット上位" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "発電方式 構成比" })).toHaveCount(0);
});
