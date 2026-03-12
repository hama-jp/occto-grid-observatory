# SS/CS/PS 緯度経度整備計画（確定座標のみ採用）

## 重要方針
- `data/master/station-location-db.json` には **手動確認済み（verified）座標のみ** を登録する。
- 推定値（エリア代表点など）はDBに入れない。
- 未確認設備は `data/master/station-location-candidates.json` に出力し、調査キューとして扱う。

## なぜこの運用にしたか
- 変電所/発電所の新設頻度は高くないため、低品質な自動推定を常時表示するより、
  件数を絞って正確な座標を蓄積する方が品質・保守性ともに高い。

## 最もロバストな緯度経度取得手順（推奨）
1. **一次情報で住所を確定**
   - 電力会社公表資料、環境アセス、自治体公開資料などを優先。
2. **2系統以上で座標照合**
   - Google Maps（主）＋ OSM/Nominatim など（副）でクロスチェック。
   - 乖離が閾値（例: 300m）以内であることを確認。
3. **逆ジオコードで設備種別確認**
   - 周辺POIやタグが変電所/発電所と矛盾しないことを確認。
4. **DB登録（high/mediumのみ）**
   - `verifiedBy`, `verifiedAt`, `source`, `address` を必須で記録。

## 取得できない場合の推定計画（DBには未登録）
- 候補ファイル上で以下を使って優先順位付けだけ実施。
  1. 設備名の地名トークン（例: 北新得→新得周辺）
  2. 接続ノードの既知座標重心
  3. 幹線の方位・連結順序
- 推定座標はレビュー補助に留め、DBに採用するのは確証が得られた後のみ。


## 現在の整備状況
- `geocode:db` で送電線名などの非設備ノード（例: `xxT（...線）`）を候補抽出から除外。
- `xxT` / `電名` / `分岐点` のような分岐点・記号ノード、複数設備を連記した複合ノード、および設備種別を判定できない `UNKNOWN` ノードは設備候補から除外。
- 発電所の号機/系列/軸表記は同一サイト座標を共有する前提で正規化し、候補の重複を圧縮。
- `npm run geocode:fill-from-hints` により、既存ヒントから一致した設備をDBへ反映。
- `npm run geocode:fill-from-mymaps` により、Google My Maps の設備ラベル一致から候補座標をDBへ反映。
- `npm run geocode:fill-from-curated` により、公式資料と地図照合で確認した設備をDBへ反映。
- 最新実行時点: **528設備中 528設備をDB登録、未解決候補は 0 件**。
- `npm run geocode:triage` の分類結果: **quick_win 0 / manual_hard 0 / ask_user 0**。
- 未解決候補は解消済み。今後は新規設備追加時のみ同じ手順で確認を継続する。
- 系統分岐点と思われるノード（関西: ４２T / 中部: 電名 / 中部: 分岐点）は設備として扱わず、候補抽出・表示対象から除外した。

## 外部情報源の調査メモ
- 共有された `https://note.com/gomatsuo/n/ndf1d864ba7b2` は「近年の実績リスト」ページで、
  変電所/発電所の緯度経度を直接取得できる公開データは確認できなかった。
- そのため、緯度経度整備は以下の一次情報を優先して進める。
  - 一般送配電事業者の設備一覧・環境アセス資料
  - 自治体の都市計画/環境影響評価の公開資料
  - OSM/GSI の地図上設備情報（一次情報の裏取り用途）
- `npm run geocode:manual-sheet` で候補ごとの検索URL付きCSVを出力し、
  「調査→裏取り→DB登録」の手作業を継続する。

## 運用コマンド
```bash
# 最新データから未登録設備候補を抽出
npm run geocode:db

# 既存ヒントから一致分をDBへ反映
npm run geocode:fill-from-hints

# Google My Maps の設備ラベル一致からDBへ反映
npm run geocode:fill-from-mymaps

# 公式資料と地図照合で確認した設備をDBへ反映
npm run geocode:fill-from-curated

# 整備進捗を確認
npm run geocode:progress

# 手動調査シート(CSV)を生成
npm run geocode:manual-sheet

# 未解決候補を難易度分類
npm run geocode:triage
```

