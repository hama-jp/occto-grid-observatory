# Linear + GitHub 実行フロー

## 1. プロジェクトの土台
1. Linearでプロジェクト `OCCTO Grid Observatory` を作る。
2. ステータスを `Backlog -> Todo -> In Progress -> In Review -> Done` に統一する。
3. GitHub連携を有効化し、PRとIssueをLinear Issueに紐づける。

## 2. Issue設計（Linear）
1. エピック例:
   - `Data Ingestion`
   - `Dashboard UX`
   - `Ops / CI`
2. 1 Issue = 1 完了条件に分割する。
3. 受け入れ条件は必ずチェックリスト化する。

## 3. ブランチ運用（GitHub）
1. ブランチ名は `feature/GRID-123-short-title` を強制する。
2. コミットメッセージ先頭に `GRID-123` を付与する。
3. PR本文にLinear URLを記載する。

## 4. CI品質ゲート
1. PR時に `lint + build` を実行する。
2. CIが落ちたPRは `In Review` へ進めない。
3. 画面変更はスクリーンショット必須。

## 5. リリース運用
1. `main/master` へマージ時に自動デプロイ。
2. リリースノートはLinear完了Issueから自動生成。
3. 障害時は `bug` テンプレートで起票し、同一Linearに紐づける。

## 6. このリポジトリでの実装済み項目
- `.github/workflows/ci.yml`
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`
- `npm run ingest` によるデータ同期コマンド
