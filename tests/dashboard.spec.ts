import { expect, test } from "@playwright/test";
import {
  AREA_ORDER,
  buildMockDashboardDatePayload,
  expectLocatorToContainChartSignal,
  getSelectOptions,
  waitForChartSurface,
  waitForDashboardReady,
} from "./helpers/dashboard";

test("dashboard smoke renders key sections", async ({ page }) => {
  await waitForDashboardReady(page);

  await expect(page.getByText("全国発電量")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "発電方式 構成比" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリアネットワーク潮流（地域内送電線）" })).toBeVisible();
});

test("area selectors use utility-area ordering by default", async ({ page }) => {
  await waitForDashboardReady(page);

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
  await waitForDashboardReady(page);

  await page.getByRole("button", { name: "俯瞰モード" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリアネットワーク潮流（地域内送電線）" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "高発電ユニット上位" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "発電方式 構成比" })).toHaveCount(0);
});

test("time slider updates the network timestamp and keeps charts rendered", async ({ page }) => {
  await waitForDashboardReady(page);

  const slider = page.getByLabel("ネットワーク潮流の表示時刻");
  const timestamp = page.getByTestId("selected-flow-datetime");
  const maxValue = Number((await slider.getAttribute("max")) ?? "0");

  expect(maxValue).toBeGreaterThan(0);

  await slider.focus();
  await page.keyboard.press("Home");

  const firstTimestamp = (await timestamp.textContent())?.trim();
  expect(firstTimestamp).toBeTruthy();

  await page.keyboard.press("End");

  await expect.poll(async () => (await timestamp.textContent())?.trim()).not.toBe(firstTimestamp);
  await waitForChartSurface(page.getByTestId("network-flow-chart"));
  await waitForChartSurface(page.getByTestId("inter-area-flow-chart"));
});

test("donut and bar chart panels keep visible chart signal", async ({ page }) => {
  await waitForDashboardReady(page);

  await expectLocatorToContainChartSignal(page.getByTestId("source-composition-panel"), 0.035);
  await expectLocatorToContainChartSignal(page.getByTestId("area-total-generation-panel"), 0.04);
  await expectLocatorToContainChartSignal(page.getByTestId("inter-area-flow-panel"), 0.045);
});

test("date selector reloads dashboard data for another day", async ({ page }) => {
  const targetDate = "2026/03/03";
  const targetStamp = "20260303";

  await page.route(`**/data/normalized/dashboard-${targetStamp}.json`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: buildMockDashboardDatePayload(targetDate),
    });
  });

  await waitForDashboardReady(page);

  const dateSelect = page.getByLabel("対象日", { exact: true });
  const headerSummary = page.getByText(/対象日:/);

  await dateSelect.evaluate((element, value) => {
    const select = element as HTMLSelectElement;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }, targetDate);

  await dateSelect.selectOption(targetDate);

  await expect(page.getByText("読み込み中...")).toBeVisible();
  await expect(headerSummary).toContainText(targetDate);
  await expect(dateSelect).toHaveValue(targetDate);
  await expect(page.getByText("読み込み中...")).toHaveCount(0);
  await expect(page.getByText(/対象日: 2026\/03\/03/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
});
