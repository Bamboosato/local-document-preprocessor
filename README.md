# local-document-preprocessor

文書をブラウザ内だけで Markdown / plain text に変換する、静的配布可能な React アプリです。

## 重要な制約

- 選択した文書と変換結果をサーバー・外部 API へ送信しません。
- 文書、変換結果、履歴、設定をアプリのストレージへ保存しません。再読み込み／タブ終了で結果は失われます。PWA の静的アプリ資産だけはキャッシュします。利用者が明示的にコピー／ダウンロードした出力は受け渡し先に残ります。
- OCR は使用しません。画像のみ／スキャン PDF は非対応です。
- PII 検出・マスキングは行いません。`local-pii-masker` へは plain text を手動でコピーまたはダウンロードして渡します。
- anydoc の成功を「欠落なし」とみなしません。PDF は PDFium の独立抽出と比較し、文字異常時のフォールバックは客観的な改善を確認できた場合だけ採用します。すべての結果で原本照合が必要です。`partial` は警告付きで出力可能、`failed` はプレビュー・コピー・ダウンロードを停止します。

## 対応形式

Word、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、機械可読テキストを含む PDF。詳細は [要件定義](docs/requirements.md) を参照してください。

入力受付形式と実ファイル検証済み範囲は異なります。未検証形式は [検証記録](docs/validation-report.md) を参照してください。

| 入力 | 範囲選択 | Markdown のページ区切り |
| --- | --- | --- |
| `.pdf` | 連続ページ範囲 | 既定オン、選択 N ページの間に N-1 件の独立行 `---` |
| `.pptx`, `.pptm`, `.ppsx`, `.ppsm` | 連続スライド範囲 | 既定オン、選択 N スライドの間に N-1 件の独立行 `---` |
| `.xlsx`, `.xlsm` | 1 件以上のシート（非表示状態も表示） | ページ区切り設定なし |
| `.docx` | 文書全体 | 本文の明示 `w:br type="page"` を検出した場合だけ設定を表示し、既定オン |
| その他の受付形式 | 文書全体 | ページ境界を推測しない |

DOCX の自動改ページ、`w:pageBreakBefore`、セクション区切りは推測しません。plain text にはページ区切りの `---` を残しません。範囲・区切り設定はファイルごとに保持し、変更すると旧結果を破棄します。

一次変換エンジンは `@firecrawl/anydoc-wasm@0.1.7` です。PDF の独立比較に `@embedpdf/pdfium@2.14.4` を使用します。両 WASM は Web Worker 内で遅延初期化します。anydoc は初回変換時、PDFium は PDF の構造確認時から使用します。キャンセル時は Worker を破棄して再生成します。

## 使い方と出力

1. ファイル選択またはドロップで最大 20 ファイル（各 50 MiB 以下）を選びます。再選択は現在のキューと結果を置き換えます。21 件以上は先頭 20 件だけを受け付け、超過分を通知します。
2. 構造確認後、単一ファイルでは範囲ダイアログが開きます。複数ファイルは各項目の「変更」から設定します。全項目の構造確認が終了してから変換を開始できます。
3. 選択順に逐次変換し、警告を確認して Markdown / plain text をプレビュー、コピー、UTF-8 ダウンロードします。Markdown の単一改行を表示し、表は表示枠内で横スクロールします。外部画像は取得せず、外部リンク要素と raw HTML は生成しません。
4. キャンセルは実行中と待機中だけをキャンセルし、完了済み結果を保持します。再変換には「変更」で範囲を再確定する、区切り設定を変更する、またはファイルを再選択します。「すべてクリア」で文書と結果の参照を破棄します。

Markdown のダウンロードだけに、次の YAML frontmatter を付与します。`title` は拡張子を含む元ファイル名、`originalUpdatedAt` は元 `File.lastModified` の UTC ISO 8601 値です。コピー、プレビュー、plain text ダウンロードには付与しません。

```yaml
---
title: "source.pdf"
originalUpdatedAt: "2026-08-14T00:00:00.000Z"
---
```

PDF の `partial` には、改善確認済み PDFium フォールバック、Type0 / ToUnicode 欠落リスク、テキストなしページの混在、独立比較不能（一次出力が非空で文字異常・構造リスクがない場合）があります。非 PDF の文字異常も警告付き `partial` です。詳細は [品質判定要件](docs/requirements.md#4-欠落防止と品質通知) を参照してください。

## PWA と静的配布

production build はホーム画面追加用 manifest とアイコンを含み、ロード後に `/sw.js` を登録します。Service Worker は同一オリジンのクエリなし GET に限り、アプリ HTML、manifest、アイコン、`/assets/` 直下の JS/CSS/Worker/WASM 等を Cache API の `ldp-static-v1` に保存します。文書や変換結果は保存せず、localStorage、sessionStorage、IndexedDB も使用しません。

HTML / manifest はネットワーク優先、その他の対象資産はキャッシュ優先です。WASM は必要時に取得するため、初回起動だけでオフライン変換を保証しません。未取得資産が必要な場合やキャッシュが消去された場合は通信が必要です。インストールや Safari 実機でのオフライン動作は未検証です。

`dist/` を HTTPS（開発時は localhost）のオリジン直下で配信してください。現行の Service Worker、manifest、アイコン URL は `/` 固定のため、Vite `base` の変更だけでサブパス配信には対応できません。詳しくは [アーキテクチャ](docs/architecture.md#静的配布) を参照してください。

## 開発

```powershell
npm ci
npm run dev
```

検証:

```powershell
npm run check
npm run test:security
npm run audit:security
npm run check:docs
npm run fixtures:pdf
npx playwright install chromium
npm run test:e2e -- --grep 'PWA|\[page-break\]'
```

`check` は Unit / Component、production build（ライセンス同梱）、`check:dist` を順に実行します。E2E の実施範囲は変更リスクで選びます。上の例は PWA とページ区切りの対象ケースのみで、全件が必要な場合は `npm run test:e2e` を使用します。同一実機では `workers: 1` で直列実行します。

Playwright は production preview を起動しますが、既存サーバーを再利用する設定です。最新成果物を確認するときは別ポートを `$env:PLAYWRIGHT_PORT = '4187'` のように指定するか既存サーバーを停止してください。Edge、macOS Safari、iPhone Safari は未検証の実機ゲートです。

### GitHub Actions

`CI / Verify` は main への PR / push と手動実行で、Node.js 24 / Ubuntu 上の `npm ci`、監査ポリシーテスト、本番・全依存の脆弱性監査、Unit / 型 / build / 成果物検査を実行します。脆弱性は深刻度にかかわらず1件でも失敗、取得不能・不正応答も失敗とし、例外はありません。毎週月曜06:00 JST（日曜21:00 UTC）には監査とポリシーテストだけを実行します。Dependabotレポートの収集予定（月曜07:17 JST）より前に設定していますが、GitHub Actionsの定期実行は遅延する場合があります。

E2E は文書だけなら未実施、PWA / UI / 品質変更なら対象ケース、依存・共通処理・CIや未分類の変更なら影響範囲が広いため全件を選び、常に1 workerで直列実行します。手動実行は主要な変換・プライバシーケースが既定で、`full_e2e` を明示すると全件です。監査JSONと合成fixtureの失敗証跡は7日保持し、実施・未実施範囲をジョブsummaryへ記録します。詳細は [CI導入仕様](docs/ci-configuration-proposal.md) と [導入検証](docs/ci-validation-report.md) を参照してください。

## ドキュメント

- [開発・テスト設計ルール](AGENTS.md)
- [要件定義](docs/requirements.md)
- [ADR-0001](docs/adr/0001-browser-only-anydoc-wasm.md)
- [ADR-0002](docs/adr/0002-pdf-objective-text-verification.md)
- [ADR-0003: ページ区切り](docs/adr/0003-deterministic-page-break-markers.md)
- [ADR-0004: PWA 静的資産キャッシュ](docs/adr/0004-pwa-static-asset-cache.md)
- [アーキテクチャ](docs/architecture.md)
- [テスト戦略](docs/test-strategy.md)
- [実装計画](docs/implementation-plan.md)
- [MVP 検証結果（過去の記録）](docs/validation-report.md)
- [実装・文書整合性監査](docs/documentation-audit.md)

## ライセンスと公式仕様

anydoc、`@embedpdf/pdfium` の JS wrapper、fflate、pdf-lib は MIT License です。同梱 PDFium WASM は Apache-2.0 です。
production build には `dist/licenses/` として各ライセンス本文を同梱します。

- [firecrawl/anydoc](https://github.com/firecrawl/anydoc)
- [WASM API](https://github.com/firecrawl/anydoc/blob/main/wasm/README.md)
- [EmbedPDF PDFium](https://www.npmjs.com/package/@embedpdf/pdfium)
