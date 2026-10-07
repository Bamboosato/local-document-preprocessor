# 実装計画

更新日: 2026-10-06

## 現在の実装・検証状況

以下の Phase は当初の作業区分であり、すべて未着手の一覧ではない。実装済みと実機品質確認済みを区別する。

| 範囲 | 状態 | 残る確認 |
| --- | --- | --- |
| Phase 0 / Phase 1 | MVP 実装済み。Worker、逐次変換、範囲選択、品質判定、出力操作、安全プレビュー | 全受付形式・全端末の品質保証ではない |
| PDF 独立比較 | 実装済み。Type0、正常、画像のみ、混在 fixture と回帰テストあり | password、破損、実 resource limit と実機 |
| DOCX 明示改ページ | 実装済み。本文 `w:br type="page"` のみ、Unit / Chromium E2E あり | 自動改ページ・ページ範囲は対象外 |
| Markdown download metadata | 実装済み。`title` / `originalUpdatedAt`、Unit / Component あり | Safari 実機のダウンロード |
| PWA / 静的配布 | manifest、アイコン、SW の静的資産キャッシュ、成果物検査・Chromium E2E あり | 実機インストール、オフライン、更新、サブパス |
| Phase 2 | 一部 fixture / Chromium 確認済み | 全形式とクロスブラウザー／実機ゲートは未完了 |

今回の実行結果は [文書整合性監査](documentation-audit.md)、過去の MVP 検証は [検証記録](validation-report.md) を参照する。

## Phase 0: 仕様固定

- anydoc WASM API、対応形式、エラーコード、同期実行制約を確認する。
- 要件、ADR、アーキテクチャ、テスト戦略をレビュー可能な形にする。
- 最重要回帰文字列と PDF リスク通知を受入条件へ入れる。

## Phase 1: 最小 MVP

- React + TypeScript + Vite を構成する。
- Converter 層、Web Worker、逐次キュー、キャンセル再生成を実装する。
- Markdown から決定的 plain text を生成する。
- 安全なプレビュー、コピー、ダウンロードを実装する。
- Markdown ダウンロード時だけ、元ファイル名を `title`、元 `File.lastModified` を UTC ISO 8601 の `originalUpdatedAt` として YAML frontmatter に付与する。plain text、プレビュー、コピーには付与しない。
- anydoc エラー分類、アプリ上限、原本照合・PDF リスク警告を実装する。
- Worker 内構造検査と、PDFページ・PowerPointスライド・Excelシートのファイル別範囲選択を実装する。安定した境界がない形式は文書全体のみとする。
- PDF／PowerPoint はページ区切りを既定オンで選択可能にし、安定境界ごとの逐次変換を `---` で結合する。plain text には区切り文字を残さない。
- DOCX の明示 `w:br type="page"` を検出した場合だけ区切り設定を表示し、一時マーカー数を検証して文書全体の Markdown へ復元する。
- Unit / Component / Chromium 実 WASM E2E / build を検証する。

## Phase 2: 形式別品質確認

- 再配布可能な各形式 fixture と期待テキストを整備する。
- 半角カタカナ、Type0、ToUnicode 欠落、password、破損、画像のみ PDF を実ファイルで回帰する。
- anydoc 異常時の PDFium 独立抽出比較、`partial` フォールバック、保証不能時の出力停止を回帰する。
- Chrome / Edge / macOS Safari / iPhone Safari で逐次処理、キャンセル、メモリ、ダウンロードを確認する。
- 欠落検出の false positive / false negative を記録し、警告閾値を根拠付きで調整する。

## Phase 3: 静的配布評価

- 配布先の CSP、MIME、キャッシュ方針、サブパスを確認する。
- 本番成果物に外部変換エンドポイント・解析 SDK がなく、SW のキャッシュが同一オリジンの静的資産に限定されることを検査する。文書・結果・設定の保存は許可しない。
- PWA のインストール、取得済み／未取得 WASM のオフライン差、キャッシュ更新・消去を実機で確認する。現行はルート配信とし、サブパス対応は別途実装・検証する。
- 実機 E2E を直列実行し、配布 URL からの通信先を記録する。

## 将来判断

ローカル版の形式別・実機品質が確認できた後にのみ、既存 `document-preprocessor` との統合や廃止を別決定として検討する。`local-pii-masker` との自動連携も、手動コピー/ダウンロードの運用評価後に別スコープで判断する。
