# 実装計画

## Phase 0: 仕様固定

- anydoc WASM API、対応形式、エラーコード、同期実行制約を確認する。
- 要件、ADR、アーキテクチャ、テスト戦略をレビュー可能な形にする。
- 最重要回帰文字列と PDF リスク通知を受入条件へ入れる。

## Phase 1: 最小 MVP

- React + TypeScript + Vite を構成する。
- Converter 層、Web Worker、逐次キュー、キャンセル再生成を実装する。
- Markdown から決定的 plain text を生成する。
- 安全なプレビュー、コピー、ダウンロードを実装する。
- anydoc エラー分類、アプリ上限、原本照合・PDF リスク警告を実装する。
- Worker 内構造検査と、PDFページ・PowerPointスライド・Excelシートのファイル別範囲選択を実装する。安定した境界がない形式は文書全体のみとする。
- PDF／PowerPoint はページ区切りを既定オンで選択可能にし、安定境界ごとの逐次変換を `---` で結合する。plain text には区切り文字を残さない。
- Unit / Component / Chromium 実 WASM E2E / build を検証する。

## Phase 2: 形式別品質確認

- 再配布可能な各形式 fixture と期待テキストを整備する。
- 半角カタカナ、Type0、ToUnicode 欠落、password、破損、画像のみ PDF を実ファイルで回帰する。
- anydoc 異常時の PDFium 独立抽出比較、`partial` フォールバック、保証不能時の出力停止を回帰する。
- Chrome / Edge / macOS Safari / iPhone Safari で逐次処理、キャンセル、メモリ、ダウンロードを確認する。
- 欠落検出の false positive / false negative を記録し、警告閾値を根拠付きで調整する。

## Phase 3: 静的配布評価

- 配布先の CSP、MIME、キャッシュ方針、サブパスを確認する。
- 本番成果物に外部エンドポイント、解析 SDK、Service Worker がないことを検査する。
- 実機 E2E を直列実行し、配布 URL からの通信先を記録する。

## 将来判断

ローカル版の形式別・実機品質が確認できた後にのみ、既存 `document-preprocessor` との統合や廃止を別決定として検討する。`local-pii-masker` との自動連携も、手動コピー/ダウンロードの運用評価後に別スコープで判断する。
