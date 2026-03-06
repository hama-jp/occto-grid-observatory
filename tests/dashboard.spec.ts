import { expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";

const AREA_ORDER = ["北海道", "東北", "東京", "中部", "北陸", "関西", "中国", "四国", "九州", "沖縄"];

async function getSelectOptions(locator: Locator): Promise<string[]> {
  return locator.locator("option").evaluateAll((options) =>
    options.map((option) => (option.textContent ?? "").trim()).filter(Boolean),
  );
}

async function waitForChartSurface(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect(locator.locator("canvas, svg").first()).toBeVisible();
}

async function waitForDashboardReady(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "送電潮流 × ユニット発電実績 ダッシュボード" })).toBeVisible();
  await waitForChartSurface(page.getByTestId("generation-trend-chart"));
  await waitForChartSurface(page.getByTestId("source-composition-chart"));
  await waitForChartSurface(page.getByTestId("area-total-generation-chart"));
  await waitForChartSurface(page.getByTestId("inter-area-flow-chart"));
}

async function expectLocatorToContainChartSignal(locator: Locator, minimumSignalRatio: number): Promise<void> {
  const image = PNG.sync.read(await locator.screenshot({ animations: "disabled" }));
  const totalPixels = image.width * image.height;
  let signalPixels = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const alpha = image.data[offset + 3];
    const brightest = Math.max(red, green, blue);
    const darkest = Math.min(red, green, blue);
    const hasColorContrast = brightest - darkest > 20;
    const isNotNearWhite = brightest < 242;

    if (alpha > 0 && (hasColorContrast || isNotNearWhite)) {
      signalPixels += 1;
    }
  }

  expect(signalPixels / totalPixels).toBeGreaterThan(minimumSignalRatio);
}

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
