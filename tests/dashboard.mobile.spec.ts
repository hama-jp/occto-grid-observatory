import { expect, test } from "@playwright/test";
import { waitForChartSurface, waitForDashboardReady } from "./helpers/dashboard";

test("mobile layout keeps controls and charts usable @mobile", async ({ page }) => {
  await waitForDashboardReady(page);

  await expect(page.getByLabel("対象日", { exact: true })).toBeVisible();
  await expect(page.getByLabel("エリア", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "俯瞰モード" })).toBeVisible();
  await expect(page.getByLabel("ネットワーク潮流の表示時刻")).toBeVisible();
  await waitForChartSurface(page.getByTestId("source-composition-chart"));
  await waitForChartSurface(page.getByTestId("inter-area-flow-chart"));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(8);
});

test("mobile overview mode suppresses heavy sections @mobile", async ({ page }) => {
  await waitForDashboardReady(page);

  await page.getByRole("button", { name: "俯瞰モード" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "発電方式 構成比" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "発電方式別 30分推移" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "エリアネットワーク潮流（地域内送電線）" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "高発電ユニット上位" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "主要線路の潮流ヒートマップ" })).toHaveCount(0);
});
