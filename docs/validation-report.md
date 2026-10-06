# MVP 検証結果

> 過去の MVP 検証記録。以下の日時・件数・証跡は原記録として保持する。実行コミットが記録されていないため、現在の実装すべてを検証済みとする根拠には使用しない。後続の PWA・DOCX 明示改ページ・Markdown ダウンロードメタデータを含む現状照合は [2026-10-06 の文書整合性監査](documentation-audit.md) を参照する。
>
> 特に「Cache・Service Worker 0」は PWA 導入前の記録である。現行は静的アプリ資産のみキャッシュする。文書と結果の非保存要件は継続する。以下の「現行 suite」は当時の suite を指す。

実施日: 2026-08-07
環境: Windows / PowerShell / Playwright Chromium（同一実機、直列実行）

## 結果

| 検証 | 結果 | 証跡 |
| --- | --- | --- |
| Unit / Component | 成功 | 13 files / 55 tests passed |
| TypeScript + Vite production build | 成功 | Worker、anydoc WASM、PDFium WASM を同一オリジン静的 asset として出力 |
| Worker 成果物検査 | 成功 | 両 WASM 存在、DOM-only API・永続ストレージ API の混入なし |
| Chromium E2E | 成功 | 現行 suite 全 11 cases passed、`workers: 1` |
| 形式別の変換範囲 | 成功 | PDF 2〜3ページ、PPTX 2〜3枚目、XLSX 非表示1シートで選択外固有文字列 0 件 |
| Markdown ページ区切り | 成功 | PDF／PPTX の既定オン、N-1区切り、オフ時0件、plain text 0件、設定変更後の再変換を Chromium 2 cases で確認 |
| Markdown 改行プレビュー | 成功 | Component で単一改行=`<br>`・空行=別段落、提供実 PDF で表示改行 171 件・段落 3 件・区切り 2 件 |
| Type0 回帰 fixture | 成功 | 指定文字列が Markdown / plain text の双方に完全一致、`U+FFFD` 0、外部要求 0、`partial` |
| PDF 分類 fixture | 成功 | 正常=`success`、画像のみ=`failed/ocr_required`、混在=`partial/mixed_pdf` |
| 提供実 PDF（非保存） | 成功 | `partial`、指定文字列が両出力に完全一致、採用出力の `U+FFFD` 0、異常制御 0、半角カタカナ 56 |
| 通信・保存 E2E | 成功 | 文書変換の外部オリジン要求 0、local/session storage・IndexedDB・Cache・Service Worker 0 |
| Production dependency audit | 成功 | 既知脆弱性 0 |
| `git diff --check` | 成功 | whitespace error なし |

提供実 PDF では、anydoc 一次変換の `U+FFFD` 1,286 件・異常制御文字 6 件を検出した。
PDFium の独立抽出は両方 0 件だったため、推測置換せず PDFium ページテキストへ切り替え、
`encoding_suspect` と `pdf_text_fallback` を付けた `partial` とした。本文、ローカルパス、
スクリーンショット、trace はリポジトリへ保存していない。

## E2E 実施範囲と選定理由

今回の変更は Converter、二つの WASM、Worker、品質状態、出力停止 UI にまたがり、
重要文字欠落を防ぐ重大リスク変更である。実装中は変更範囲ごとに対象ケースを選択し、
PR 前は MVP 全体が対象となるため、Chromium の production build 経路にある現行 E2E
全 11 件を `workers: 1` で直列実行した。全件実行を常時の既定にはしていない。

- CSV の日本語・半角カタカナ完全一致、外部通信なし、保存なし。
- Type0 / `UniJIS-UCS2-H` / ToUnicode 欠落 PDF の独立比較、partial、両出力完全一致。
- 正常な機械可読 PDF を誤って partial にしないこと。
- 画像のみ PDF を `ocr_required` の failed とし、出力操作を停止すること。
- テキストページとテキストなしページの混在を `mixed_pdf` の partial とすること。
- 375 × 812 の狭幅で重要警告と選択操作が横にはみ出さないこと。
- PDF のページ範囲、PowerPoint のスライド範囲、Excel のシート選択を実 Worker / anydoc 経路で変換し、選択外固有文字列が Markdown / plain text に混入しないこと。
- Excel の非表示シート表示、DOCX 等の「文書全体」通知、Vercel版相当の範囲ダイアログと要約表示。
- 提供実 PDF をローカル production build に手動投入し、状態、診断件数、両出力の指定文字列、異常文字件数、同一オリジン WASM 要求だけであること。

Markdown 改行プレビュー変更は表示層だけを対象とするため、Component で単一改行と空行の
DOM 構造を検証し、Chromium では既存の変換・外部通信・保存・PDF 品質分類 6 ケースを
直列再実行した。Edge / Safari / iPhone Safari の全件実行は既定にせず、未実施とした。

ページ区切り変更は Worker 通信、PDF／PPTX の単位再構成、Markdown／plain text、設定変更後の
状態遷移にまたがるため、実装時は Chromium の対象 E2E 2 件を `workers: 1` で直列実行した。
PDF 2ページとPPTX 2スライドで既定オンの区切り1件、plain text 0件、PPTXをオフへ変更後の
旧結果破棄と区切り0件を確認し、PR 前には他の対象ケースを含む現行 Chromium E2E 全 11 件を
再実行した。Edge、Safari、iPhone Safari 実機は未実施である。

## 未実施範囲と残存リスク

- Edge 実ブラウザ、macOS Safari、iPhone Safari 実機は未実施。WASM 初期化、メモリ上限、Clipboard、ダウンロード差異が残る。
- 当時の Word、OpenDocument、RTF、EPUB の実 fixture E2E は未実施。後続で DOCX の明示改ページ fixture E2E を追加したが、Word 全形式の品質確認完了を意味しない。
- PowerPoint は `.pptx`、Excel は `.xlsx` の範囲 fixture を実施済み。旧 Office、マクロ有効 Office、OpenDocument、RTF、EPUB は文書全体変換のみで、実 fixture E2E は未実施。
- password 付き、破損 PDF、実 resource limit は分類 unit までで、実ファイル E2E は未実施。
- PDF の一部が画像でも背景・装飾だけのページとの機械的区別はできない。テキストなしページは安全側に mixed とする。
- 二つの抽出エンジンが同じ欠落を起こす可能性は排除できないため、success/partial とも原本照合は必須である。
- iPhone 相当テストは Chromium の狭幅表示であり、iPhone Safari 実機確認の代替ではない。

これらはリリース候補のクロスブラウザー／実機ゲートとする。実機品質が確認できるまで、
既存 `document-preprocessor` の廃止・統合判断は行わない。

## 検出した問題と再発防止

### 1. Type0 / ToUnicode 欠落時の無警告文字化け

- 影響度: 致命。日本語 PII 相当文字列が誤ったまま後段へ渡る。
- 分類: 実装問題。anydoc 下位 PDF 実装が `UniJIS-UCS2-H/HW-H` を復号できず `U+FFFD` を返した。
- なぜ検出できたか: 合成データだけでなく提供実 PDF をページ単位で比較し、指定文字列と異常文字件数を確認したため。
- なぜ従来検出できなかったか: anydoc の完了を変換成功として扱い、独立抽出との差と出力操作を品質状態へ反映していなかったため。
- 再発防止: 非 PII Type0 fixture、PDFium 独立比較、`encoding_suspect`、partial/failed、failed の出力停止を unit/E2E に固定した。

### 2. 画像のみ PDF が品質結果へ到達しない

- 影響度: 重大。OCR 非対応は通知されるが、画像のみ／混在の状態モデルが統一されない。
- 分類: 実装問題。anydoc の `unsupported` が PDFium ページ分類より先に Worker を終了させた。
- なぜ検出できたか: mock だけでなく生成 PDF を実 anydoc/PDFium Worker E2E に投入したため。
- なぜ unit で検出できなかったか: finalize 層へ空 Markdown が渡る前提だけを試験し、anydoc の先行エラーを含めていなかったため。
- 再発防止: PDF の `unsupported` だけを PDFium 分類へ引き継ぐ境界を追加し、他形式・破損エラーが伝播する unit と画像のみ E2E を追加した。

### 3. Component テスト間の DOM 残留

- 影響度: 軽微（製品 runtime 影響なし）。失敗状態 UI テストの独立性を損なう。
- 分類: テスト前提条件の問題。
- 再発防止: 共通 test setup で各ケース後に Testing Library `cleanup()` を実行する。

## 優先度判断

- まず防ぐべき致命リスク: 外部送信・永続保存、文書間混入、日本語・半角カタカナの無警告欠落。
- 対策済み: ブラウザ内独立比較、異常文字検出、Type0 1文字欠落検出、選択範囲外文字列 0 件、partial/failed、failed 出力停止、非 PII fixture、外部通信 0 の E2E。
- 残る重大ゲート: Edge / Safari / iPhone Safari 実機、password・破損・resource limit 実データ、Office 形式別 fixture。
