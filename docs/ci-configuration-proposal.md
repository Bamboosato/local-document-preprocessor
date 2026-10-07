# GitHub Actions 導入検討案

検討日: 2026-10-07（Asia/Tokyo）
状態: 承認済み・実装。本書の調査結果は導入前の記録として保持する。現在の実装・実行結果は [導入検証](ci-validation-report.md) を参照。
対象: `local-document-preprocessor`、調査時の `codex/docs-align-implementation` / `40d3d37`。

## 結論

`tennis-organizing-app` の「固定依存インストール、品質確認、脆弱性監査、実経路E2E、証跡保存」という構成を採用する。Firebase / Java のチェックは不要で、本製品では実 anydoc / PDFium WASM と PWA の許可境界を確認する。既存の開発依存脆弱性を解消してから、本番・開発依存とも例外なしで監査を開始する案を基本とする。

## 導入前の確認記録

- GitHub Actions ワークフローなし。現状の PR チェックは Vercel 関連。
- `package-lock.json` は lockfileVersion 3。`npm ci` で固定依存を再現できる構成。
- `npm run check` は Unit / Component → TypeScript + Vite build → ライセンス同梱 → `check:dist`。前回のローカル検証は14 files / 63 tests成功。
- Node.js 24.13.0 で既存検証を実施。インストール済み Vite / Vitest / jsdom / Playwright の Node 制約に Node 24 は適合。
- ESLint の設定・lint コマンドは存在しないため、当初の必須ステップへ架空の lint を追加しない。
- E2E は Chromium の14ケース定義、`workers: 1`、再試行0、失敗時 screenshot / trace。CIでは既存サーバーを再利用しない設定。

### 今回取得した脆弱性監査

`npm audit --json --omit=dev` と `npm audit --json` を実行。依存・lockfileは変更していない。件数は勧告の本数ではなく、npm が脆弱と報告したパッケージの集計。

| 範囲 | 結果 |
| --- | --- |
| 本番依存 | 0件、終了コード0 |
| 全依存 | 5件：high 3 / moderate 2、終了コード1 |

| パッケージ | 深刻度 | 位置付け |
| --- | --- | --- |
| `nanoid` | high | 間接依存 |
| `source-map-js` | high | 間接依存 |
| `undici` | high | 間接依存、複数勧告あり |
| `@vitest/mocker` | moderate | 間接依存 |
| `vitest` | moderate | 直接の開発依存、mockerと同じ勧告を含む |

全5件で `fixAvailable: true` が報告された。ただし安全な更新バージョンや互換性は未検証。更新候補を調べ、lockfile差分・Unit / build / 対象E2Eを確認してから採用する。`npm audit fix --force` による自動一括変更は導入手順に含めない。

## 先に固定する検証観点

まず防ぐべき不具合は、監査取得失敗を成功扱いすること、文書データを含む証跡の公開、WASM更新に伴う無警告欠落・文書間混入である。

| 観点 | 正常系 | 異常系 | 境界値 | 状態遷移 |
| --- | --- | --- | --- | --- |
| 機能 | npm ci、Unit、build、成果物、実WASM | 監査失敗、初期化失敗、出力停止 | 0/1件の監査指摘、1単位の範囲 | PR更新、cancel、再変換 |
| 非機能 | Ubuntu / Node24、同一実行環境で直列 | npm取得不能、timeout、Linux差 | 本番/開発依存、監査例外の期限 | 同一PRの古いrun取消、定期監査 |
| データ | lockfile再現、合成fixture完全一致 | 不正JSON、別勧告、保存禁止違反 | moderate/high/critical、欠落0/1文字 | 依存更新後の再監査、キャッシュ初期化 |
| UI | PWA・警告・範囲・プレビュー | failedの出力操作停止 | 狭幅、多数列、長い名前 | 区切り変更で旧結果破棄 |

## 推奨構成

| 項目 | 設定案・理由 |
| --- | --- |
| ワークフロー | `.github/workflows/ci.yml`、名称 `CI` |
| 起動 | mainへのPR / push、手動実行。週次で監査のみ（月曜09:00 JST = 月曜00:00 UTC）も追加候補 |
| 実行環境 | `ubuntu-latest` / Node.js 24 / npmキャッシュ。lockfileを基準にインストール |
| 権限 | `contents: read`。PR検証に秘密情報・本番文書は渡さない |
| 同時実行 | 同一PRの旧実行のみ取消。mainへのpush・定期監査は取消対象から分ける。1ランナー内の検証は直列、E2Eは1 worker |
| 主要ジョブ | `Verify`。監査は通常検証の前段で実行し、週次の場合は監査のみ |
| 必須チェック | 導入後に `Verify` をmainのマージ条件へ登録。未実施のE2E範囲はジョブsummaryに明記 |

処理順序:

1. checkout、Node.js 24の準備、`npm ci`。
2. 監査判定ポリシーの単体テスト。
3. 本番依存と全依存の監査。監査JSONを保存し、判定結果に従って失敗させる。
4. `npm run check`。既存のUnit、型、production build、WASM / Worker / PWA / ライセンス検査を維持する。
5. E2E対象の場合のみChromiumを `--with-deps` で準備し、選定したケースを `--workers=1` で実行する。
6. `always()` で監査JSONをアップロード。E2E失敗時は合成fixtureのtrace / screenshotを保存し、ケース名・範囲・結果をsummaryへ記載する。

既存Playwright設定はE2E起動時にもbuildする。初期導入ではこの経路を維持してもよい。重複buildを減らす場合は、CIに限って前段で作成済みのdistをpreviewする設定へ変更し、未buildのdistや古い成果物を使わないことを検証する。

## 脆弱性の判定基準

- 本番依存は深刻度によらず1件以上で失敗。開発依存も原則1件以上で失敗。現在の5件を放置したまま導入するとCIは失敗する。
- npm audit の取得失敗、timeout、不正JSON、件数の整合不良を失敗扱いにする。単純な `continue-on-error` は付けない。
- tennis-organizing-appの期限付き例外は移植しない。対象勧告と依存が異なるため。
- 例外なしを基本とする。将来、修正版未公開などで例外が必要になった場合だけ、勧告URL・パッケージとversion・dev-only・担当・根拠・期限を限定し、critical、新しい勧告、本番依存化、期限超過は許可しない。
- audit は既知のnpm勧告の確認であり、未知の脆弱性や同梱WASMの完全な安全性を証明しない。anydoc / PDFiumの更新確認と実WASM回帰も必要。

監査スクリプトのテストケース案（上記観点を前提に作成）:

| 区分 | 初期条件・入力 | 検証意図 |
| --- | --- | --- |
| 正常 | 本番・全依存とも有効な0件のJSON | 脆弱性なしだけを成功にする |
| 異常 | 本番依存にlow以上の指摘1件 | 深刻度閾値で本番指摘を見逃さない |
| 境界 | 全依存の指摘0件と1件 | dev-onlyでも指摘があれば失敗する |
| 異常 | 非JSON、error応答、件数不一致、timeout | 監査不能を成功にしない |
| 状態遷移 | 同一lockfileでも監査DBに新勧告 | 週次監査で新規指摘を検出する |
| 将来の境界 | 例外期限前/一致/後、versionや勧告の変更 | 例外導入時だけ、許可範囲を広げないテストを追加する |

## E2E範囲の選び方

全件を毎回の既定にしない。変更ファイルと依存する処理から選び、対象・理由・未実施範囲を記録する。

| 変更 | 推奨範囲 | 意図 |
| --- | --- | --- |
| 文書のみ | 原則未実施、文書リンク検査。仕様の根拠確認が必要なら対象ケース | 文書更新だけで全ブラウザ変換を繰り返さない |
| PWA / manifest / SW | PWA、CSV | 静的キャッシュ許可境界とデータ非保存・外部通信なし |
| DOCXページ区切り | DOCXの文書全体・明示改ページ | 境界条件と旧結果破棄・再変換 |
| PDF品質・範囲 | Type0、正常、画像のみ、混在、PDF範囲 | 欠落・OCR分類・範囲外混入・出力停止 |
| 選択機能 | 影響するPDF / PPTX / XLSX / DOCX | 範囲外混入、単位順、設定変更 |
| 表・狭幅UI | wide-table、狭幅、初期表示の該当ケース | 警告と操作の可視性、はみ出し |
| 共通Worker / anydoc / PDFium / Markdown依存、広範なlock更新 | 影響分析で対象を決定。複数形式へ及ぶ更新や範囲不明ならChromium全14件 | エンジン・ブラウザ実行経路の互換性 |
| 手動リリース候補 | 必要に応じChromium全件、別途クロスブラウザー／実機 | 配布品質の確認。Linux ChromiumをSafari実機の代替にしない |

テストは新規context、リポジトリ内の合成fixtureだけで実施する。既存PDF / Office fixtureを使うため、通常CIで再生成は必須にしない。実文書を投入する自動化や全文ログは追加しない。証跡の保持は短期（例: 7日）とし、失敗解析に必要なものへ限定する。

## 導入手順と今回の未実施範囲

1. 5件の脆弱性の更新候補と依存経路を確認し、必要な依存・lock更新を独立した変更として検証する。
2. 監査ポリシーとテスト、GitHub Actions、README / テスト戦略を実装する。Lint追加は別途設定を用意する場合だけ対象とする。
3. LinuxのGitHub Actionsでnpm ci、監査、Unit、型、build、成果物、選定E2Eを実行し、Windowsとの環境差を確認する。
4. PRの実行が成功した後に必須チェック・週次監査の運用を設定する。

検討時に実施したのはソース・既存設定・Node制約の確認とnpm auditの取得のみ。導入検証とは区別し、前回のローカル成功をCI導入成功とは扱わない。

## 採用した実装

- Ubuntu / Node.js 24、mainへのPR / push、手動実行、月曜09:00 JSTの監査を実装。追加のLintやFirebase/Javaステップは導入しない。
- `scripts/security-audit.mjs` と純粋な監査判定、`npm run test:security` / `npm run audit:security` を実装。本番・全依存とも全深刻度をブロックし、例外は設けない。
- `scripts/ci-e2e-scope.mjs` で変更ファイルから対象を判定。文書のみは未実施、PWA / UI / 品質は対象ケース、共通処理・依存・CI・未分類は全件。手動は主要ケースが既定で、全件は明示入力。判定自体のテストも追加した。
- `npm run check:docs` でREADME / AGENTS / docsのローカルリンク・見出し参照・コードフェンスを検査する。週次監査以外で実行する。
- PRの旧実行だけ取消、監査JSONはalways、合成fixtureの失敗証跡は失敗時のみ、保持は7日。ジョブsummaryに実施・未実施を記録する。
- 初期導入は既存Playwrightのbuild経路を維持する。Safari実機とPWAインストール・更新・オフラインをCI成功だけで検証済みとは扱わない。

参考:

- [tennis-organizing-app CI](https://github.com/Bamboosato/tennis-organizing-app/blob/main/.github/workflows/ci.yml)
- [監査実行](https://github.com/Bamboosato/tennis-organizing-app/blob/main/scripts/security-audit.mjs)
- [監査ポリシー](https://github.com/Bamboosato/tennis-organizing-app/blob/main/scripts/security-audit-policy.mjs)
