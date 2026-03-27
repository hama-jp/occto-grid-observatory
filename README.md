# OCCTO Grid Observatory

地内基幹送電線の潮流実績（OCCTO NET3）、地域間連系線の潮流実績、ユニット別発電実績（公開システム）を統合して可視化する Next.js ダッシュボードです。

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
# daily: 既定でJST前日を更新（force=true相当）
npm run ingest

# now: 当日（または指定日）を更新
npm run ingest -- --mode=now
npm run ingest -- --mode=now --date=2026-03-05

# backfill: 過去日付を範囲取得（既存JSONは既定でskip）
npm run ingest -- --mode=backfill --from=2026-02-20 --to=2026-02-29

# 既存JSONがあっても上書きしたい場合
npm run ingest -- --mode=backfill --from=2026-02-20 --to=2026-02-29 --force=true
```

出力:
- `data/raw/YYYYMMDD/*.csv`
  - `generation-YYYYMMDD.csv`
  - `flow-YYYYMMDD-<area>.csv`
  - `intertie-YYYYMMDD-<連系線>.csv`
- `data/normalized/dashboard-latest.json`
- `data/normalized/dashboard-YYYYMMDD.json`


## 変電所/発電所 位置DB（SS/CS/PS）
```bash
# 最新データから未登録設備候補を抽出
npm run geocode:db

# 既存のダッシュボード内ヒントからDBへ移行（初回整備用）
npm run geocode:fill-from-hints

# Google My Maps の設備ラベル一致からDBへ反映
npm run geocode:fill-from-mymaps

# 公式資料と地図の突き合わせで手動確認した候補をDBへ反映
npm run geocode:fill-from-curated

# 整備進捗を確認（カバレッジ）
npm run geocode:progress

# 手動調査用シート（検索URL付きCSV）を生成
npm run geocode:manual-sheet

# 未解決候補の難易度を分類（quick_win / manual_hard / ask_user）
npm run geocode:triage
```

- 確定座標DB: `data/master/station-location-db.json`（verifiedのみ）
- 未登録候補: `data/master/station-location-candidates.json`
- 手動調査シート: `data/master/station-location-research-sheet.csv`
- トリアージ結果: `data/master/station-location-triage.json`
- Google My Maps 照合結果: `data/master/station-location-mymaps-matches.json`
- 位置整備方針: `docs/station-geocoding-plan.md`

## 開発起動
```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開くと、`data/normalized/dashboard-latest.json` を読み込んで表示します。

## UIテスト
```bash
npx playwright install chromium
npm run test:ui
```

- `npm run test:ui` は `build -> 静的配信 -> Playwright` の順に実行
- 失敗時は `playwright-report/` と `test-results/` に成果物を出力
- 公開中の GitHub Pages を直接監視する場合:

```bash
$env:PLAYWRIGHT_BASE_URL="https://hama-jp.github.io/occto-grid-observatory/"
npm run test:ui:public
```

- カバー内容:
  - 主要セクションの表示確認
  - エリア選択の並び順確認
  - 俯瞰モードでの表示制御確認
  - 時間スライダーの回帰確認
  - 対象日切替時のデータ再読込確認
  - 円グラフ・棒グラフの描画信号確認
  - モバイル viewport での操作性と横溢れ確認

## 運用フロー（Linear + GitHub）
- [LINEAR_GITHUB_WORKFLOW.md](docs/LINEAR_GITHUB_WORKFLOW.md)
- [ROADMAP.md](docs/ROADMAP.md)

## CI
PR / push 時に以下を実行:
- `npm run lint`
- `npm run build`
- `npm run test:ui`

別ワークフロー `UI Monitor` で公開URLに対する定期監視も実行:
- 対象: `https://hama-jp.github.io/occto-grid-observatory/`
- 実行: 毎日 `09:30 / 15:30 / 21:30 / 03:30 JST`
- 失敗時: open issue を自動作成し、既存 issue があればコメント追記

`.github` 配下に Issue / PR テンプレートを用意しています。

## データ更新の自動化（GitHub Actions）
- ワークフロー: [data-refresh.yml](.github/workflows/data-refresh.yml)
- 定時実行:
  1. **15:10 / 18:10 JST** に `mode=now` を実行して、当日分の途中経過を保存
  2. **13:10 / 16:10 / 21:10 JST** に `mode=backfill` で過去4日分を再取得（前日確定データは概ね 13 時台に初公開）
- 処理内容:
  1. schedule時は `mode=now` または `mode=backfill` を時刻ごとに切り替えて実行
  2. 発電実績 + 地内基幹送電線 + 地域間連系線のCSVを取得して正規化
  3. `data/normalized` に差分があれば自動コミット＆push
  4. `main` へのpushをトリガーに Pages デプロイが走る
- 手動実行:
  - Actions 画面の `Data Refresh` から `workflow_dispatch` を実行
  - `mode`:
    - `now`: 当日/指定日の都度更新
    - `daily`: 前日分更新
    - `backfill`: `from/to` 範囲を一括取得
  - `sample`:
    - `daily`: 日次で取得
    - `monthly`: 月次スナップショットで取得
    - `quarterly`: 四半期スナップショットで取得
  - `force=true` で既存JSONを上書き更新
  - 初回の長期履歴埋めは upstream 負荷を抑えるため `monthly` / `quarterly` を推奨
  - Pages の日付セレクタに過去日を増やしたい場合は、最初に `backfill` を数日から数週間分だけ流して `dashboard-YYYYMMDD.json` を作成しておく

例:
```bash
# 直近7日分をまとめて保持
npm run ingest -- --mode=backfill --from=2026-02-27 --to=2026-03-04
```

## GitHub Pages 公開
- ワークフロー: [deploy-pages.yml](.github/workflows/deploy-pages.yml)
- 初回設定:
  1. GitHubリポジトリの `Settings > Pages` を開く
  2. `Build and deployment` の `Source` を `GitHub Actions` にする
- URL:
  - `https://hama-jp.github.io/occto-grid-observatory/`
