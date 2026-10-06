# 実装・文書整合性監査

実施日: 2026-10-06（Asia/Tokyo）

## 対象と前提

- GitHub `Bamboosato/local-document-preprocessor` の `origin/main` を取得し、ローカル HEAD と一致する `b43d0d6bf3e6ab78342407956bde802ae469edb8` を基準に照合した。
- README、要件、アーキテクチャ、実装計画、テスト戦略、ADR、検証記録を対象とした。変更は文書と既存 DOCX E2E の期待文言のみで、製品実装・依存・fixture を変更しない。
- 既存テストの存在、ソース照合、今回の実行、過去の実行記録を区別する。すべての形式・端末での品質保証を意味しない。

## 先に固定した検証観点

まず防ぐべき不具合は、文書保存・外部送信の誤認、選択外文字の混入、重要文字欠落の無警告成功である。

| 観点 | 正常系 | 異常系 | 境界値 | 状態遷移 |
| --- | --- | --- | --- | --- |
| 機能 | 対応形式、範囲、出力、メタデータ | エラー分類、画像 PDF、マーカー欠落 | 1単位、範囲端、20件、50 MiB | 検査→待機→逐次変換、取消、再確定、再選択 |
| 非機能 | Worker 隔離、同一オリジン、静的 PWA | 登録・抽出失敗、未取得 WASM | 静的 URL とクエリ付き URL | SW install / activate、更新、キャッシュ消去 |
| データ | 日本語・半角カタカナ、範囲内完全一致 | 異常文字、Type0、欠落差 | 異常0/1、空出力、更新日時epoch | 旧結果破棄、完了済み保持、文書間非混入 |
| UI | 警告、範囲、表、改行、両出力操作 | failed の出力停止、コピー失敗 | 狭幅、長い名前、多数列 | ダイアログ取消、区切り変更、クリア |

## 指摘と修正

| 問題 | 影響 | 実装根拠 | 文書の修正 |
| --- | --- | --- | --- |
| SW / Cache 全面禁止と PWA が矛盾 | 致命リスクに関する説明不整合 | `src/main.tsx`、`public/sw.js`、`tests/e2e/pwa.spec.ts` | README / 要件 / 設計 / 計画 / 戦略へ静的資産だけの例外、ADR-0004 |
| DOCX 明示改ページが README・設計で不足、戦略に「PDF/PPTだけ」 | 主要機能の説明漏れ | `documentSelection.ts`、`convertWithPageBreaks.ts`、DOCX E2E | 対象拡張子、検出条件、自動改ページ非対応、安全停止を追記 |
| Markdown ダウンロードメタデータが README にない | 出力仕様の説明漏れ | `utils/files.ts`、`ResultCard.tsx` と各テスト | `title` / `originalUpdatedAt`、UTC、ダウンロード限定を追記 |
| partial を改善済み PDF 出力だけと説明 | 出力品質の誤認 | `finalizeConversion.ts`、`assessConversion.ts` | Type0、混在、比較不能、非PDF異常も区別し、原本照合を維持 |
| 追加順・再実行の説明が実際の UI とずれる | 置き換えによる結果消失、回復操作の誤認 | `App.tsx` の replaceSelection / cancel / onConfirm | キュー置き換え、完了保持、範囲再確定による再変換を明記 |
| PDFium 初期化が変換時だけと説明 | 初回取得・オフラインの誤認 | `PdfPageProcessor.ts`、`PdfiumTextExtractor.ts` | PDF 構造確認から使用すると README / 要件 / ADR に反映 |
| Vite base だけでサブパス対応できると説明 | 配布時の PWA 動作不良 | ルート固定の SW / manifest / index.html | オリジン直下配布と、サブパスで必要な修正を明記 |
| 過去の件数・Cache/SW 0 を現行検証として読める | 検証範囲の誤認 | validation-report と現行14 E2E定義 | 過去の原記録と明示し、現行監査へリンク |
| ADR-0003 と成果物検査の導線が不足 | 開発・検証手順の漏れ | package.json、scripts/check-dist.mjs | README に ADR、`npm ci`、`npm run check`、対象 E2E を追記 |
| DOCX E2E が旧案内文を期待し、変換前に失敗 | 回帰確認の停止 | `SelectionDialog.tsx:109` と `conversion.spec.ts:433`、失敗 trace | ダイアログ内の現行案内文を検証する期待値へ修正。変換・区切り判定は維持 |

分類は文書と実装の追従不足であり、この監査で製品の漏えいや文字欠落が新たに再現されたという意味ではない。PWA・DOCX・メタデータの後続実装が複数文書へ部分的にしか反映されていなかったことを、ソースと文書の横断照合で検出した。

## 今回の検証範囲と結果

| 検証 | 結果 | 根拠・実施範囲 |
| --- | --- | --- |
| `npm run check` | 成功 | Unit / Component 14 files・63 tests、TypeScript + production build、両 WASM / Worker / PWA / 5ライセンスの成果物検査 |
| 対象 Chromium E2E 初回 | 4成功・1失敗 | PWA、CSV、PDF範囲・区切り、PPTX範囲・区切りが成功。DOCX は旧案内文の期待値で変換前に失敗 |
| DOCX E2E 修正後 | 1成功 | 現行 UI に期待文言を合わせ、改ページ既定オン、Markdown の hr 1件、plain text の区切り0件、オフ変更後の旧結果破棄と再変換まで成功 |
| 文書リンク・構造 | 成功 | 12 Markdown 文書のローカルリンク20件と見出し参照・コードフェンスに不整合なし |
| `git diff --check` | 成功 | whitespace error なし |

実行環境は Windows / PowerShell / ローカル Playwright Chromium。初回 `npm run check` はサンドボックスの子プロセス起動制限 `spawn EPERM` でテスト開始前に停止した。制限外の同じコマンドで成功し、環境問題として区別した。ブラウザは未使用の preview ポート4187、再実行は4188を指定し、古いサーバーを再利用しなかった。

DOCX 失敗はテスト観点ではなく期待データ（UI文言）の追従不足である。DOM 証跡に明示改ページの案内と設定があり、ソースの現行文言と一致するため、検出失敗や変換不良とは分類しなかった。期待文言だけをダイアログ内の現行文言に合わせ、後段の実変換検証は変更しなかった。初回の screenshot / trace / error context は非 PII の合成 fixture に限定して `tmp/documentation-audit/docx-initial-failure/` に保持し、Git 管理外とした。

再現コマンド（依存インストール済み、Chromium利用可能、未使用ポートが前提）:

```powershell
npm run check
$env:PLAYWRIGHT_PORT = '4187'
npm run test:e2e -- --grep 'PWA|実 WASM|\[page-break\]'
# 期待文言修正後の対象再実行
$env:PLAYWRIGHT_PORT = '4188'
npm run test:e2e -- --grep '\[page-break\] DOCX'
git diff --check
```

E2E は「対象ケースのみ」とし、PWA 1 件、日本語 CSV 1 件、PDF／PPTX／DOCX ページ区切り 3 件を Chromium の新規 context・production preview・`workers: 1` で直列実行した。初回成功4件と修正後成功1件を合わせて対象5件を確認した。静的キャッシュと非保存の説明、実変換経路、DOCX 記載追加の根拠を確認する意図で選んだ。全件・クロスブラウザーを既定にはしない。メタデータは既存 Unit / Component で確認した。

## 未実施範囲と残存リスク

- Chromium の他の E2E、Edge / macOS Safari / iPhone Safari 実機、実機インストール、オフライン変換、SW 更新競合は今回未実施。PWA E2E はオフライン保証の証明ではない。
- 旧 Office、マクロ有効 Office、OpenDocument、RTF、EPUB の実 fixture、password / 破損 / 実 resource limit、低メモリ・大容量は今回未実施。
- 品質診断は意味的完全一致を証明しない。非 PDF には独立比較がなく、PDF でも二つの実装の共通欠落、空白・順序の違い、Type0 検出のヒューリスティックが残る。
- 全端末の品質確認と既存製品の廃止・統合は未完了のゲートとして保持する。

## 再発防止

機能変更時は README の利用者向け説明、要件、レイヤー責務、ADR、実装状況、テスト観点、実行証跡の更新対象を確認する。検証記録は実施日・基準コミット・範囲を持ち、過去の件数を現行全体の成功として転記しない。未自動化のケースは戦略に明示し、テスト定義の存在を実施済みの証拠にしない。
