# local-document-preprocessor 要件定義

更新日: 2026-08-07

## 1. 目的と製品境界

本製品は、利用者が選択した文書をブラウザ内だけで Markdown と plain text に変換する静的 Web アプリである。既存の `document-preprocessor` とは別リポジトリ・別製品とし、既存版を変更しない。PII 検出・マスキングは `local-pii-masker` の責務とし、本製品には実装しない。

### 対象

- ファイル内容をサーバーや外部 API に送らず、Firecrawl anydoc WASM で変換する。
- Markdown / plain text のプレビュー、コピー、ダウンロードを提供する。
- 複数ファイルを追加順に逐次処理する。
- plain text は Markdown から同一入力に対して常に同一結果となる規則で生成する。
- `local-pii-masker` へは plain text の手動コピーまたはダウンロードで渡す。

### 対象外

- OCR、画像のみまたはスキャン PDF の変換。
- PII の検出、マスキング、復元。
- ファイル、変換結果、履歴、設定の一時保存・永続保存。
- クラウド同期、認証、サーバー変換、外部 API。
- 既存製品との自動連携、既存製品の廃止。

## 2. 対応入力

anydoc 0.1.7 の公式対応範囲を本 MVP の候補形式とする。

| 種別 | 拡張子 |
| --- | --- |
| Word | `.doc`, `.docx`, `.docm` |
| PowerPoint | `.ppt`, `.pps`, `.pot`, `.pptx`, `.pptm`, `.ppsx`, `.ppsm` |
| Excel | `.xls`, `.xlsx`, `.xlsm`, `.xlsb` |
| OpenDocument | `.odt`, `.ods`, `.odp` |
| Rich Text Format | `.rtf` |
| EPUB | `.epub` |
| CSV | `.csv` |
| PDF | `.pdf`（機械可読テキストを含むもののみ） |

形式は可能な限り内容から判定する。CSV のように署名を持たない形式はファイル名の拡張子を補助情報にする。MVP のアプリ上限は 1 ファイル 50 MiB、1 回 20 ファイルとする。anydoc 自身の展開量・ネスト・ノード数の安全上限も別に適用される。

## 3. 機能要件

1. ドラッグ＆ドロップまたはファイル選択で複数ファイルを受け付ける。
2. 追加順に 1 ファイルずつ Web Worker で変換する。同時変換しない。
3. WASM は最初の変換要求時に遅延初期化し、通常時は再利用する。
4. キャンセル時は実行中 Worker を破棄し、新しい Worker を生成する。実行中と未処理項目はキャンセル状態にする。
5. anydoc 依存は Converter 層に閉じ込め、UI・キュー制御・品質診断から直接参照しない。
6. 結果ごとに Markdown / plain text を切り替えて確認、コピー、UTF-8 ダウンロードできる。
7. Markdown プレビューは外部画像 URL を `src` に設定せず、外部リンクをリンク要素として生成しない。raw HTML は描画しない。
8. クリア時は保持中の `File` と変換結果への参照を破棄する。
9. PDF は anydoc の一次変換後、同じ Worker 内の PDFium WASM でページ別テキストを独立抽出して品質を比較する。両 WASM と文書はブラウザ外へ出さない。
10. 品質状態を `success` / `partial` / `failed` に分ける。`failed` はプレビュー、コピー、ダウンロードを提供しない。
11. ファイル選択後に Worker 内で文書構造を事前解析し、ファイルごとに変換範囲を設定できるようにする。
12. PDF は連続ページ範囲、PowerPoint OOXML は連続スライド範囲、Excel OOXML はシート選択に対応する。DOCX と安定した単位境界を取得できない形式は、境界を推測せず文書全体を変換する。
13. 範囲選択は 1 始まりで表示し、開始・終了の逆転、範囲外、シート未選択を変換前に拒否する。複数ファイルでは選択内容を各キュー項目へ保持する。
14. 変換時は選択範囲だけを Worker 内で一時的な入力へ再構成し、範囲外の本文を Markdown / plain text / 品質比較へ混入させない。再構成データは保存しない。
15. PDF と PowerPoint OOXML では「Markdownにページ区切りを挿入する」オプションをファイルごとに表示し、既定値をオンとする。DOCX は `word/document.xml` の本文中に明示された `w:br` の `type="page"` を検出できる場合だけ同じオプションを表示し、既定値をオンとする。
16. PDF／PowerPoint の選択単位は Worker 内で安定した境界単位へ分け、元の順序で逐次変換する。DOCX は文書全体を一度変換し、検出した明示改ページだけを Markdown の独立行 `---` として保持する。自動改ページ、`w:pageBreakBefore`、セクション区切りは推測しない。
17. ページ区切りは Markdown の構造としてのみ保持し、決定的 plain text では文字列 `---` を出力しない。オプション変更時は既存結果を破棄し、未変換状態へ戻す。

### 形式別の変換範囲

| 入力 | 選択単位 | 挙動 |
| --- | --- | --- |
| PDF | ページ | 連続した開始〜終了ページ、または全ページ |
| `.pptx`, `.pptm`, `.ppsx`, `.ppsm` | スライド | 連続した開始〜終了スライド、または全スライド |
| `.xlsx`, `.xlsm` | シート | 1 件以上のシート、または全シート。非表示状態を明示 |
| DOCX | 文書全体 | ページ範囲は指定せず、明示された `w:br type="page"` だけ Markdown の区切りとして保持可能 |
| 旧 Office、OpenDocument、RTF、EPUB、CSV 等 | 文書全体 | 安定したページ境界を推測せず、全体のみ |

## 4. 欠落防止と品質通知

最優先で防ぐ不具合は、機械可読テキスト、氏名・所属・住所・ID 等の日本語 PII 相当文字列が無警告で欠落することである。

- anydoc が成功を返しても「欠落なし」と判定しない。品質比較後の `success` も「変換成功（要原本照合）」として表示する。
- PDF は常に原本照合警告を表示する。Type0 フォントを含み `/ToUnicode` が見つからない PDF は追加の高リスク警告を表示する。
- 置換文字 `U+FFFD`、C0/C1 制御文字、不自然な Unicode、孤立サロゲート、入力サイズに比べて極端に短い出力を検出する。
- Type0 / ToUnicode 欠落または文字異常がある場合、anydoc 由来 plain text と PDFium 抽出の文字頻度をコードポイント単位で比較して欠落差を検出する。
- PDFium 側が非空、異常 0 件で、anydoc より客観的に改善する場合だけ PDFium ページテキストから Markdown を再構成し、そこから決定的に plain text を生成する。結果は `encoding_suspect` と `pdf_text_fallback` を付けた `partial` とする。
- 独立抽出でも改善しない、または異常 PDF を比較できない場合は `failed` とし、誤った出力の利用を停止する。
- 推測による文字補完・全半角変換・Unicode 正規化は行わない。半角カタカナをそのまま保持する。
- 回帰文字列 `ICT本部品質技術ｿﾘｭｰｼｮﾝ部ｿﾘｭｰｼｮﾝ第一課` の完全一致を検証対象にする。
- `partial` は警告を常時表示したうえでコピー・ダウンロードを許可する。`failed` はプレビュー・コピー・ダウンロードを停止する。

## 5. エラー要件

| 分類 | 利用者への通知 |
| --- | --- |
| `encrypted` | パスワード付き・暗号化文書は非対応。解除した複製を選ぶよう通知する。 |
| `ocr_required` | 全ページが画像のみ／スキャンの PDF として `failed` を通知する。 |
| `mixed_pdf` | テキストページとテキストなしページの混在を `partial` として通知する。 |
| `unsupported` | 未対応形式を通知する。 |
| `malformed` | 文書が破損または構造不正で読み取れないことを通知する。 |
| `resourceLimit` | 安全のため展開量・ネスト・ノード数等の上限で停止したことを通知する。 |
| `missingPart` | 変換に必要な文書内部パーツが欠落していることを通知する。 |
| アプリ上限 | 50 MiB 超過または 20 ファイル超過を変換前に通知する。 |

エラーに入力本文、変換本文、ローカルパス、スタックトレースを含めない。

## 6. 非機能要件

- 配布物は静的ファイルのみで成立する。
- `localStorage`、`sessionStorage`、IndexedDB、Cache API、Service Worker を使用しない。
- 変換中もメインスレッドを長時間占有せず、キャンセル操作を受け付ける。
- アプリ自身から外部オリジンへ通信しない。実行に必要な JS/WASM/CSS は同一オリジンから取得する。
- CSP で外部接続・外部画像・プラグイン・フォーム送信を拒否する。
- Chrome、Edge、macOS Safari、iPhone Safari を最終対応対象とする。
- 端末ごとのメモリ上限差、とくに iPhone Safari での Worker/WASM 再生成を実機確認する。
- 同一実機に対する E2E は並列実行しない。

## 7. MVP 受入条件

- 日本語・半角カタカナを含む CSV がブラウザ内で変換され、Markdown と plain text の両方で完全一致する。
- 非 PII の Type0 / ToUnicode 欠落 PDF fixture が `partial` となり、回帰文字列が Markdown / plain text の両方に完全一致し、`U+FFFD`・異常制御文字・文字欠落が 0 件である。
- 正常な機械可読 PDF は誤って `partial` にならず、保証できない結果は `success` にならない。
- 画像のみ PDF は `failed`、テキストと画像のみページの混在 PDF は `partial` として区別される。
- 複数ファイルが逐次処理され、キャンセルで Worker が破棄・再生成される。
- PDF のページ、PowerPoint のスライド、Excel のシートを指定でき、範囲外の固有文字列が両出力へ混入しない。DOCX は文書全体のみと明示する。
- PDF／PowerPoint ではページ区切りオプションが既定オンで、選択した N 単位に対して Markdown の区切りが N-1 件となる。明示改ページを含む DOCX では検出数と同数の区切りを保持する。オフでは 0 件、plain text では設定によらず 0 件となる。
- 成功結果が必ず原本照合を要求し、PDF 固有リスクを追加表示する。
- 主要な anydoc エラーが利用者向け日本語に分類される。
- プレビューに外部 `img` / `a` 要素が生成されず、raw HTML が実行されない。
- ビルド成果物が静的ホスティングでき、変換時の外部通信がない。

## 8. 公式仕様の根拠

- [anydoc README](https://github.com/firecrawl/anydoc#readme)
- [WASM API](https://github.com/firecrawl/anydoc/blob/main/wasm/README.md)
- [WASM binding source](https://github.com/firecrawl/anydoc/blob/main/wasm/src/lib.rs)
- [MuPDF-independent PDFium WASM package](https://www.npmjs.com/package/@embedpdf/pdfium)

調査時点の npm latest は `@firecrawl/anydoc-wasm@0.1.7`。WASM API は同期・単一スレッドであり、Worker 利用を公式に推奨している。画像のみ PDF は `unsupported`、暗号化文書は `encrypted`、固定安全上限超過は `resourceLimit` を返す。

独立比較には `@embedpdf/pdfium@2.14.4` を使用する。ラッパーは MIT、同梱 PDFium WASM は Apache-2.0 であり、同一オリジンの静的 asset として遅延取得する。サーバー変換へのフォールバックは実装しない。
