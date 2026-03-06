import { promises as fs } from "node:fs";
import path from "node:path";

const DASHBOARD_FILE_PATTERN = /^dashboard-(latest|\d{8})\.json$/;

async function main(): Promise<void> {
  const sourceDir = path.join(process.cwd(), "data", "normalized");
  const targetDir = path.join(process.cwd(), "public", "data", "normalized");

  await fs.mkdir(targetDir, { recursive: true });

  const sourceFiles = await listDashboardFiles(sourceDir);
  const targetFiles = await listDashboardFiles(targetDir);
  const sourceSet = new Set(sourceFiles);

  for (const fileName of targetFiles) {
    if (sourceSet.has(fileName)) {
      continue;
    }
    await fs.rm(path.join(targetDir, fileName), { force: true });
  }

  for (const fileName of sourceFiles) {
    await fs.copyFile(path.join(sourceDir, fileName), path.join(targetDir, fileName));
  }

  console.log(`[sync-public-data] synced ${sourceFiles.length} dashboard file(s) to ${targetDir}`);
}

async function listDashboardFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && DASHBOARD_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, "en"));
  } catch {
    return [];
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sync-public-data] failed: ${message}`);
  process.exitCode = 1;
});
