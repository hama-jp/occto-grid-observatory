import { expect, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AREA_DISPLAY_ORDER } from "../../src/lib/constants";

export const AREA_ORDER = AREA_DISPLAY_ORDER;

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
  const surface = locator.locator("canvas, svg").first();
  await expect(surface).toBeVisible();
}

export async function waitForDashboardReady(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "発電実績 ×送電潮流実績 ダッシュボード" })).toBeVisible();
  await waitForChartSurface(page.getByTestId("generation-trend-chart"));
  await waitForChartSurface(page.getByTestId("reserve-trend-chart"));
  await waitForChartSurface(page.getByTestId("demand-current-chart"));
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

export async function expectLocatorToContainMotion(locator: Locator, minimumMotionRatio: number, frameDelayMs = 900): Promise<void> {
  await locator.page().waitForTimeout(1600);
  const firstFrame = PNG.sync.read(await locator.screenshot({ animations: "allow" }));
  await locator.page().waitForTimeout(frameDelayMs);
  const secondFrame = PNG.sync.read(await locator.screenshot({ animations: "allow" }));

  expect(firstFrame.width).toBe(secondFrame.width);
  expect(firstFrame.height).toBe(secondFrame.height);

  const totalPixels = firstFrame.width * firstFrame.height;
  let movingPixels = 0;

  for (let offset = 0; offset < firstFrame.data.length; offset += 4) {
    const redDiff = Math.abs(firstFrame.data[offset] - secondFrame.data[offset]);
    const greenDiff = Math.abs(firstFrame.data[offset + 1] - secondFrame.data[offset + 1]);
    const blueDiff = Math.abs(firstFrame.data[offset + 2] - secondFrame.data[offset + 2]);
    const alphaMax = Math.max(firstFrame.data[offset + 3], secondFrame.data[offset + 3]);
    const colorDiff = redDiff + greenDiff + blueDiff;

    if (alphaMax > 0 && colorDiff > 42) {
      movingPixels += 1;
    }
  }

  expect(movingPixels / totalPixels).toBeGreaterThan(minimumMotionRatio);
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
