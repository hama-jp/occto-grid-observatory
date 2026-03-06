import { expect, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
import path from "node:path";

export const AREA_ORDER = ["北海道", "東北", "東京", "中部", "北陸", "関西", "中国", "四国", "九州", "沖縄"];

const FIXTURE_FILE = path.join(process.cwd(), "data", "normalized", "dashboard-20260304.json");

type DashboardFixture = {
  meta: {
    targetDate: string;
    fetchedAt: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export async function getSelectOptions(locator: Locator): Promise<string[]> {
  return locator.locator("option").evaluateAll((options) =>
    options.map((option) => (option.textContent ?? "").trim()).filter(Boolean),
  );
}

export async function waitForChartSurface(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect(locator.locator("canvas, svg").first()).toBeVisible();
}

export async function waitForDashboardReady(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "送電潮流 × ユニット発電実績 ダッシュボード" })).toBeVisible();
  await waitForChartSurface(page.getByTestId("generation-trend-chart"));
  await waitForChartSurface(page.getByTestId("reserve-trend-chart"));
  await waitForChartSurface(page.getByTestId("reserve-current-chart"));
  await waitForChartSurface(page.getByTestId("source-composition-chart"));
  await waitForChartSurface(page.getByTestId("area-total-generation-chart"));
  await waitForChartSurface(page.getByTestId("inter-area-flow-chart"));
}

export async function expectLocatorToContainChartSignal(locator: Locator, minimumSignalRatio: number): Promise<void> {
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

export function buildMockDashboardDatePayload(targetDate: string): string {
  const fixture = JSON.parse(readFileSync(FIXTURE_FILE, "utf-8")) as DashboardFixture;
  const dateStamp = targetDate.replaceAll("/", "-");
  fixture.meta = {
    ...fixture.meta,
    targetDate,
    fetchedAt: `${dateStamp}T12:00:00+09:00`,
  };
  return JSON.stringify(fixture);
}
