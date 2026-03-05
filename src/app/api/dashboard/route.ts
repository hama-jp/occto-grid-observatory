import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

function toDateStamp(date: string): string | null {
  const normalized = date.replaceAll("-", "/").trim();
  const matched = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!matched) {
    return null;
  }
  return `${matched[1]}${matched[2]}${matched[3]}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");

  let fileName = "dashboard-latest.json";
  if (dateParam) {
    const stamp = toDateStamp(dateParam);
    if (!stamp) {
      return NextResponse.json(
        { message: "date is invalid. use YYYY-MM-DD or YYYY/MM/DD." },
        { status: 400 },
      );
    }
    fileName = `dashboard-${stamp}.json`;
  }

  const filePath = path.join(process.cwd(), "data", "normalized", fileName);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      {
        message: "Dashboard data was not found. Run `npm run ingest` first.",
        detail: message,
      },
      { status: 404 },
    );
  }
}
