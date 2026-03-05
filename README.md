# OCCTO Grid Observatory

地内基幹送電線の潮流実績（OCCTO NET3）と、ユニット別発電実績（公開システム）を統合して可視化する Next.js ダッシュボードです。

## 技術スタック
- Next.js 16 / React 19 / TypeScript
- ECharts (`echarts-for-react`)
- Playwright（CSV取得自動化）
- `csv-parse` + `iconv-lite`（UTF-8/Shift_JIS 正規化）

## セットアップ
```bash
npm install
npx playwright install chromium
```

## データ取り込み
```bash
# 既定: JSTの前日
npm run ingest

# 日付指定
npm run ingest -- --date=2026-03-04
```

出力:
- `data/raw/YYYYMMDD/*.csv`
- `data/normalized/dashboard-latest.json`
- `data/normalized/dashboard-YYYYMMDD.json`

## 開発起動
```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開くと、`/api/dashboard` から最新正規化データを読んで表示します。

## API
- `GET /api/dashboard` : `dashboard-latest.json`
- `GET /api/dashboard?date=YYYY-MM-DD` : 指定日のJSON

## 運用フロー（Linear + GitHub）
- [LINEAR_GITHUB_WORKFLOW.md](docs/LINEAR_GITHUB_WORKFLOW.md)
- [ROADMAP.md](docs/ROADMAP.md)

## CI
PR / push 時に以下を実行:
- `npm run lint`
- `npm run build`

`.github` 配下に Issue / PR テンプレートを用意しています。

## データ更新の自動化（GitHub Actions）
- ワークフロー: [data-refresh.yml](.github/workflows/data-refresh.yml)
- 定時実行: 毎日 **16:10 JST**（= **07:10 UTC**）
- 処理内容:
  1. `npm run ingest`
  2. `data/normalized` に差分があれば自動コミット＆push
- 手動実行:
  - Actions 画面の `Data Refresh` から `workflow_dispatch` を実行
  - `date` 入力（`YYYY-MM-DD`）で対象日を明示指定可能
