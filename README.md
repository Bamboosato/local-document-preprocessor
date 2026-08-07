# local-document-preprocessor

文書をブラウザ内だけで Markdown / plain text に変換する、静的配布可能な React アプリです。

## 重要な制約

- 選択した文書と変換結果をサーバー・外部 API へ送信しません。
- 一時保存・永続保存を行いません。タブを閉じると結果は失われます。
- OCR は使用しません。画像のみ／スキャン PDF は非対応です。
- PII 検出・マスキングは行いません。`local-pii-masker` へは plain text を手動でコピーまたはダウンロードして渡します。
- anydoc の成功を「欠落なし」とみなしません。PDF はブラウザ内 PDFium 抽出と客観比較し、改善が確認できた結果だけ `partial` として出力します。保証不能な結果はコピー・ダウンロードを停止します。

## 対応形式

Word、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、機械可読テキストを含む PDF。詳細は [要件定義](docs/requirements.md) を参照してください。

ファイル選択後、PDF はページ範囲、PowerPoint OOXML はスライド範囲、Excel OOXML はシートを選択できます。PDF／PowerPoint は、Markdown のページ／スライド間へ独立行の `---` を挿入する設定が既定で有効です。plain text には区切り文字を残しません。DOCX など安定したページ境界を取得できない形式は、境界を推測せず文書全体を変換します。複数ファイルではキュー項目ごとに範囲と区切り設定を保持します。

一次変換エンジンは `@firecrawl/anydoc-wasm@0.1.7` です。PDF の独立比較に `@embedpdf/pdfium@2.14.4` を使用します。両 WASM は Web Worker 内で遅延初期化され、複数ファイルは逐次処理されます。キャンセル時は Worker を破棄して再生成します。

## 開発

```powershell
npm install
npm run dev
```

検証:

```powershell
npm run test:unit
npm run build
npm run fixtures:pdf
npx playwright install chromium
npm run test:e2e
```

E2E は同一実機に対して並列実行しない設定です。初期 MVP は Chromium の対象ケースを実行し、Edge、macOS Safari、iPhone Safari はリリース候補で実機確認します。

## ドキュメント

- [開発・テスト設計ルール](AGENTS.md)
- [要件定義](docs/requirements.md)
- [ADR-0001](docs/adr/0001-browser-only-anydoc-wasm.md)
- [ADR-0002](docs/adr/0002-pdf-objective-text-verification.md)
- [アーキテクチャ](docs/architecture.md)
- [テスト戦略](docs/test-strategy.md)
- [実装計画](docs/implementation-plan.md)
- [MVP 検証結果](docs/validation-report.md)

## ライセンスと公式仕様

anydoc、`@embedpdf/pdfium` の JS wrapper、fflate、pdf-lib は MIT License です。同梱 PDFium WASM は Apache-2.0 です。
production build には `dist/licenses/` として各ライセンス本文を同梱します。

- [firecrawl/anydoc](https://github.com/firecrawl/anydoc)
- [WASM API](https://github.com/firecrawl/anydoc/blob/main/wasm/README.md)
- [EmbedPDF PDFium](https://www.npmjs.com/package/@embedpdf/pdfium)
