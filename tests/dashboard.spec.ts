import { expect, test } from "@playwright/test";
import {
  AREA_ORDER,
  expectLocatorToContainMotion,
  buildMockDashboardDatePayload,
  expectLocatorToContainChartSignal,
  getSelectOptions,
  waitForChartSurface,
  waitForDashboardReady,
} from "./helpers/dashboard";

test("dashboard smoke renders key sections", async ({ page }) => {
  await waitForDashboardReady(page);

  await expect(page.getByText("全国発電量")).toBeVisible();
  await expect(page.getByText("最大ユニット")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリア予備率（30分推移）" })).toBeVisible();
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

test("area supply cards use utility-area ordering by default", async ({ page }) => {
  await waitForDashboardReady(page);

  const areaCardHeadings = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: "エリア別需給カード" }) })
    .locator("article h3");

  await expect(areaCardHeadings).toHaveCount(AREA_ORDER.length);
  await expect(areaCardHeadings.first()).toHaveText("北海道");
  await expect(areaCardHeadings.last()).toHaveText("沖縄");
});

test("overview mode hides deep-dive sections", async ({ page }) => {
  await waitForDashboardReady(page);

  await page.getByRole("button", { name: "俯瞰モード" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "発電方式 構成比" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "発電方式別 30分推移" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "エリアネットワーク潮流（地域内送電線）" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "高発電ユニット上位" })).toHaveCount(0);
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

test("network flow chart keeps visible motion on major lines", async ({ page }) => {
  await waitForDashboardReady(page);

  const chart = page.getByTestId("network-flow-chart");
  await waitForChartSurface(chart);
  await expectLocatorToContainMotion(chart, 0.0025);
});

test("network overlay tracks graph roam transforms", async ({ page }) => {
  await waitForDashboardReady(page);

  const chart = page.getByTestId("network-flow-chart");
  const overlayRoam = page.getByTestId("network-flow-overlay-roam");

  await waitForChartSurface(chart);
  await expect(overlayRoam).toBeVisible();
  await page.waitForTimeout(1200);

  const beforePanTransform = await overlayRoam.getAttribute("transform");
  expect(beforePanTransform).toBeTruthy();

  await chart.evaluate((node) => {
    const chartNode = node as HTMLDivElement & {
      __occtoDispatchGraphRoam?: (payload: {
        dx?: number;
        dy?: number;
        zoom?: number;
        originX?: number;
        originY?: number;
      }) => void;
    };
    chartNode.__occtoDispatchGraphRoam?.({ dx: 96, dy: -42 });
  });

  await expect.poll(async () => await overlayRoam.getAttribute("transform")).not.toBe(beforePanTransform);
  const beforeZoomTransform = await overlayRoam.getAttribute("transform");

  await chart.evaluate((node) => {
    const chartNode = node as HTMLDivElement & {
      __occtoDispatchGraphRoam?: (payload: {
        dx?: number;
        dy?: number;
        zoom?: number;
        originX?: number;
        originY?: number;
      }) => void;
    };
    const rect = chartNode.getBoundingClientRect();
    chartNode.__occtoDispatchGraphRoam?.({
      zoom: 1.12,
      originX: rect.width / 2,
      originY: rect.height / 2,
    });
  });

  await expect.poll(async () => await overlayRoam.getAttribute("transform")).not.toBe(beforeZoomTransform);
});

test("donut and bar chart panels keep visible chart signal", async ({ page }) => {
  await waitForDashboardReady(page);

  await expectLocatorToContainChartSignal(page.getByTestId("source-composition-panel"), 0.035);
  await expectLocatorToContainChartSignal(page.getByTestId("area-total-generation-panel"), 0.04);
  await expectLocatorToContainChartSignal(page.getByTestId("inter-area-flow-panel"), 0.045);
});

test("date selector reloads dashboard data for another day", async ({ page }) => {
  const targetDate = "2026/03/09";
  const targetInputDate = "2026-03-09";
  const targetStamp = "20260309";

  await page.route(`**/data/normalized/dashboard-${targetStamp}.json`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: buildMockDashboardDatePayload(targetDate),
    });
  });

  await waitForDashboardReady(page);

  const dateInput = page.getByLabel("対象日", { exact: true });
  const headerSummary = page.getByText(/対象日:/);

  await dateInput.fill(targetInputDate);

  await expect(headerSummary).toContainText(targetDate);
  await expect(dateInput).toHaveValue(targetInputDate);
  await expect(page.getByText("読み込み中...")).toHaveCount(0);
  await expect(page.getByText(/対象日: 2026\/03\/09/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "エリア別需給カード" })).toBeVisible();
});

test("date selector shows a clear message when the selected day is unavailable", async ({ page }) => {
  await waitForDashboardReady(page);

  const headerSummary = page.getByText(/対象日:/);
  const dateInput = page.getByLabel("対象日", { exact: true });

  // Use a far-future date that is guaranteed to have no data
  await dateInput.fill("2029-12-31");

  await expect(page.getByText(/2029\/12\/31 の公開データはまだありません。最新は /)).toBeVisible();
  await expect(headerSummary).not.toContainText("2029/12/31");
  await expect(page.getByText("読み込み中...")).toHaveCount(0);
});
