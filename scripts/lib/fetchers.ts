/**
 * Data fetchers — download CSV/JSON files from OCCTO and related sources.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Download, type Page } from "playwright";
import {
  HKS_BASE,
  OCCTO_LOGIN_URL,
  FLOW_AREAS,
  NoDataAvailableError,
  sanitizeFilePart,
  sleep,
  type DownloadResult,
} from "./constants";

export async function downloadCsvFiles(targetDate: string, rawDir: string): Promise<DownloadResult> {
  const generationCsv = await downloadGenerationCsv(targetDate, rawDir);
  const flowCsvByArea = await downloadFlowCsvByArea(targetDate, rawDir);
  const intertieCsvByLine = await downloadIntertieCsvByLine(targetDate, rawDir);
  const reserveJson = await downloadReserveJson(targetDate, rawDir);
  return { generationCsv, flowCsvByArea, intertieCsvByLine, reserveJson };
}

async function downloadGenerationCsv(targetDate: string, rawDir: string): Promise<string> {
  return retryOperation(`generation ${targetDate}`, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    try {
      await page.goto(`${HKS_BASE}/disclaimer-agree`, { waitUntil: "domcontentloaded" });

      const agreedCheckbox = page.locator("#agreed");
      if (await agreedCheckbox.isVisible()) {
        await agreedCheckbox.check();
        await Promise.all([
          page.waitForURL("**/info/home", { timeout: 60_000 }),
          page.locator("#next").click(),
        ]);
      }

      await page.goto(`${HKS_BASE}/info/hks`, { waitUntil: "domcontentloaded" });
      await page.fill('input[name="tgtDateDateFrom"]', targetDate);
      await page.fill('input[name="tgtDateDateTo"]', targetDate);

      await page.locator("#search_btn").click();
      await waitForGenerationCsvAvailability(page, targetDate);

      const download = await captureDownload(page, async () => {
        await page.locator("#csv_btn").click();
      });

      const outputPath = path.join(rawDir, `generation-${targetDate.replaceAll("/", "")}.csv`);
      await download.saveAs(outputPath);
      return outputPath;
    } finally {
      await context.close();
      await browser.close();
    }
  });
}

async function downloadFlowCsvByArea(targetDate: string, rawDir: string): Promise<string[]> {
  const outputFiles: string[] = [];
  for (const area of FLOW_AREAS) {
    const outputPath = await retryOperation(`flow ${targetDate} ${area.name}`, async () =>
      downloadFlowCsvForSingleArea(targetDate, rawDir, area.code, area.name),
    );
    outputFiles.push(outputPath);
    console.log(`[ingest] downloaded flow csv for ${area.name}`);
  }
  return outputFiles;
}

async function downloadFlowCsvForSingleArea(
  targetDate: string,
  rawDir: string,
  areaCode: string,
  areaName: string,
): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(OCCTO_LOGIN_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#menu1-2").click();

    const popupPromise = context.waitForEvent("page");
    await page.locator("#menu1-2-2-1").click();
    const flowPage = await popupPromise;
    await flowPage.waitForLoadState("domcontentloaded");

    await flowPage.fill("#tgtNngp", targetDate);
    await flowPage.selectOption("#areaCdAreaSumNon", areaCode);
    await flowPage.locator("#searchBtn").click();
    await flowPage.waitForSelector("#csvBtn:not([disabled])", { timeout: 120_000 });

    const download = await captureDownload(flowPage, async () => {
      await flowPage.locator("#csvBtn").click();
      await flowPage.getByRole("button", { name: "OK" }).click();
    });

    const outputPath = path.join(
      rawDir,
      `flow-${targetDate.replaceAll("/", "")}-${areaCode}-${areaName}.csv`,
    );
    await download.saveAs(outputPath);
    return outputPath;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function downloadIntertieCsvByLine(targetDate: string, rawDir: string): Promise<string[]> {
  return retryOperation(`intertie ${targetDate}`, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const outputFiles: string[] = [];

    try {
      await page.goto(OCCTO_LOGIN_URL, { waitUntil: "domcontentloaded" });
      await page.locator("#menu1-1").click();

      const popupPromise = context.waitForEvent("page");
      await page.locator("#menu1-1-3-1").click();
      const intertiePage = await popupPromise;
      await intertiePage.waitForLoadState("domcontentloaded");
      await intertiePage.waitForSelector("#tgtRkl", { timeout: 60_000 });

      const options = await intertiePage.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLSelectElement>("#tgtRkl option"))
          .map((option) => ({
            value: option.value.trim(),
            label: option.textContent?.trim() ?? "",
          }))
          .filter((option) => option.value.length > 0),
      );

      for (let i = 0; i < options.length; i += 1) {
        const option = options[i];
        console.log(`[ingest] downloading intertie csv for ${option.label}`);
        try {
          await intertiePage.fill("#spcDay", targetDate);
          await intertiePage.selectOption("#tgtRkl", option.value);
          await intertiePage.locator("#searchBtn").click();
          await intertiePage.waitForLoadState("networkidle").catch(() => {});

          const csvButton = intertiePage.locator("#csvBtn");
          await intertiePage.waitForTimeout(700);
          if (!(await csvButton.isEnabled())) {
            console.log(`[ingest] skip intertie csv (no data): ${option.label}`);
            continue;
          }

          const download = await captureDownload(
            intertiePage,
            async () => {
              await csvButton.click();
              const okButton = intertiePage.locator('.ui-dialog-buttonset button:has-text("OK")').first();
              await okButton.click({ timeout: 10_000 }).catch(() => {});
              await intertiePage.locator(".ui-widget-overlay").first().waitFor({ state: "hidden" }).catch(() => {});
            },
            30_000,
          );

          const fileIndex = String(i + 1).padStart(2, "0");
          const safeLabel = sanitizeFilePart(option.label);
          const outputPath = path.join(
            rawDir,
            `intertie-${targetDate.replaceAll("/", "")}-${fileIndex}-${safeLabel}.csv`,
          );
          await download.saveAs(outputPath);
          outputFiles.push(outputPath);
          console.log(`[ingest] downloaded intertie csv for ${option.label}`);
        } catch (error: unknown) {
          const detail = error instanceof Error ? error.message : String(error);
          console.warn(`[ingest] skip intertie csv for ${option.label}: ${detail}`);

          const cancelButton = intertiePage
            .locator('.ui-dialog-buttonset button:has-text("cancel"), .ui-dialog-titlebar-close')
            .first();
          if (await cancelButton.isVisible().catch(() => false)) {
            await cancelButton.click().catch(() => {});
          }
          await intertiePage.keyboard.press("Escape").catch(() => {});
        }

        await intertiePage.waitForTimeout(800);
      }

      return outputFiles;
    } finally {
      await context.close();
      await browser.close();
    }
  });
}

async function downloadReserveJson(targetDate: string, rawDir: string): Promise<string> {
  return retryOperation(`reserve ${targetDate}`, async () => {
    const encodedDate = encodeURIComponent(targetDate);
    const response = await fetch(`https://web-kohyo.occto.or.jp/kks-web-public/home/dailyData?inputDate=${encodedDate}`, {
      headers: {
        accept: "application/json, text/plain, */*",
      },
    });
    if (!response.ok) {
      throw new Error(`reserve endpoint returned ${response.status}`);
    }

    const text = await response.text();
    const outputPath = path.join(rawDir, `reserve-${targetDate.replaceAll("/", "")}.json`);
    await fs.writeFile(outputPath, text, "utf-8");
    return outputPath;
  });
}

async function captureDownload(
  page: Page,
  trigger: () => Promise<void>,
  timeoutMs = 120_000,
): Promise<Download> {
  const downloadPromise = page.waitForEvent("download", { timeout: timeoutMs });
  await trigger();
  return downloadPromise;
}

async function waitForGenerationCsvAvailability(page: Page, targetDate: string): Promise<void> {
  const stateHandle = await page.waitForFunction(() => {
    const csvButton = document.querySelector("#csv_btn");
    const bodyText = document.body.innerText;
    const isCsvReady =
      csvButton instanceof HTMLButtonElement
        ? !csvButton.disabled
        : !!csvButton && !csvButton.hasAttribute("disabled");

    if (isCsvReady) {
      return { status: "ready" as const };
    }
    if (/対象データがありません。?/.test(bodyText)) {
      return { status: "no-data" as const };
    }
    return false;
  }, { timeout: 120_000 });

  const state = (await stateHandle.jsonValue()) as { status: "ready" | "no-data" };
  if (state.status === "no-data") {
    throw new NoDataAvailableError("generation", targetDate, `generation data is not published yet for ${targetDate}`);
  }
}

async function retryOperation<T>(label: string, action: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1) {
        console.warn(`[ingest] retry ${attempt}/${attempts}: ${label}`);
      }
      return await action();
    } catch (error: unknown) {
      lastError = error;
      if (error instanceof NoDataAvailableError) {
        throw error;
      }
      if (attempt === attempts) {
        throw error;
      }
      await sleep(5000 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`failed: ${label}`);
}
