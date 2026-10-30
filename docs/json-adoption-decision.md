# JSON図表示の採用決定と今回の対象範囲

> 2026-10-30追加承認: PR #20をマージしmainを同期した。次は[CUR-02の状態・保持量・故障回復](json-state-recovery-validation.md)をレビュー用ブランチで検証する。JSON表/平文の特大プレビューは抜粋と全量出力を区別する設計追補を加える。Mermaidの採用基準は維持。新PRマージ・デプロイ・macOS/iOS・実機操作は行わない。

> 2026-10-30追加承認: PR #19のマージで第一段階の本体接続をmainへ取り込んだ。[第二段階の対象UI検証](json-target-ui-validation.md)は別ブランチで進め、新PRマージ・デプロイ・macOS/iOS・実機操作は行わない。

> 2026-10-30追加承認: PR #18マージと、検証ブランチでの段階的な本体接続が許可された。[接続結果](json-product-connection-validation.md)を参照。以下の旧「本体統合保留」は接続変更のmain取り込み/公開保留として扱う。新PRのマージ/デプロイ・macOS/iOS・実機操作は行わない。

> 2026-10-27追記: PR #16取り込み後の[本体接続前の追加結果](json-integration-readiness-validation.md)と[接続設計](json-product-connection-design.md)を参照。本体統合保留とmacOS/iOS対象外は継続する。

決定日: 2026-10-26、採用変更: 2026-10-30。ユーザー指示によりknowledge-board同等の標準Mermaid表示へ変更する。[最新設計](json-standard-mermaid-design.md)と[検証計画](json-standard-mermaid-plan.md)を優先する。旧独自SVG報告は履歴として保持し、新方式の成功へ流用しない。

## 採用する方式

- アプリ内の図は固定Mermaid版の標準renderで表示する。strict・HTML無効・SVGサニタイズ・50 KiB自動描画上限・図/ソース切替・古い描画排除を採用する。
- 構文検証は静的URL Worker、標準描画は画面DOMで行う。画面側同期描画の5秒強制中断と独立配置Workerを必須条件から外す。
- Markdown／plain textの出力は、固定版Mermaidで検証したソースを維持する。表示方式の変更を理由にソースの検証や全量照合を省かない。
- 図/ソース切替・スクロール・失敗案内・検証済み本文を維持した明示再試行を採用する。図内ズーム・全体表示・リセットは必須外。表示上限超過でも検証済み出力を維持し、未検証時の出力は停止する。

## 今回の対象と後日確認

今回の製品化・統合判定の対象はWindowsのChrome／Edge。Windows FirefoxとPlaywright WebKitの結果は補助検証として扱う。

**macOS・iOS関連は一旦対象外。** 実macOS Safari、iPhone Safari、iOSのインストール済みPWA、VoiceOver、iPhoneのタッチ・縦横切替・メモリ圧等はユーザーが後日適切なタイミングで確認する。これらは今回のWindows向け作業・統合判定の停止条件にしない。未実施という事実は保持し、対応確認済み・ゲート通過とは表示しない。

Windows上のPWA更新・容量不足・複数タブ・回復、読み上げ、実ズーム、メモリ負荷、製品CSP・配布ライセンス、JSONの状態・キュー・出力契約は今回の残件として保持する。

## 本体統合の扱い

方式採用の未決定状態は解消した。本体統合は引き続き保留し、今回対象のG-01～04条件を証拠付きで満たしてから判断する。macOS/iOSの後日確認を待つ必要はないが、対象外化をWindowsの未確認条件の解消に流用しない。

次の作業は[標準Mermaid計画](json-standard-mermaid-plan.md)の独立試作・検証とする。旧方式のCSP/更新/配布条件と区別し、新方式の残件を[報告書](json-standard-mermaid-validation.md)へ残す。マージ・デプロイは実施しない。新レビュー用ブランチもvercel.jsonでGit自動デプロイを無効化する。

関連資料: [要件](local-document-preprocessor-json-requirements-v0.2.md)、[画面設計](local-document-preprocessor-json-screen-design-v0.2.md)、[方式比較](json-product-adoption-proposal.md)、[既存結果](json-product-readiness-validation.md)、[要件対応表](json-requirement-evidence-matrix.md)、[後日実機手順](json-device-validation-runbook.md)。

新方式の実装と検証は[標準Mermaid報告](json-standard-mermaid-validation.md)を参照。旧方式の[Windows追加検証](json-adoption-followup-validation.md)は履歴として保持する。
